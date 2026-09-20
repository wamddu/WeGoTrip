package com.travel.travelbackend.controller;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@RestController
@RequestMapping("/api/maps")
@CrossOrigin(origins = "${maps.allowed-origins:http://localhost:8081,http://localhost:8082}")
public class MapsController {
    private final String apiKey;
    private final RestClient client;
    private long windowStarted = System.nanoTime();
    private int searches;
    private int images;

    public MapsController(@Value("${GOOGLE_MAPS_API_KEY:}") String apiKey) {
        this.apiKey = apiKey;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(12));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public record Location(double latitude, double longitude) {}
    public record DisplayName(String text) {}
    public record GooglePlace(String id, DisplayName displayName, String formattedAddress,
                              Location location, List<String> types) {}
    public record SearchResponse(List<GooglePlace> places) {}
    public record PlaceResult(String id, String name, String address, Location coordinates,
                              String category) {}

    @GetMapping("/places/search")
    public ResponseEntity<?> search(@RequestParam String query) {
        if (query.isBlank() || query.length() > 150)
            return error(HttpStatus.BAD_REQUEST, "검색어를 1~150자로 입력해 주세요.");
        if (apiKey.isBlank()) return unavailable();
        if (!allowRequest(true)) return error(HttpStatus.TOO_MANY_REQUESTS, "검색 요청이 많아요. 잠시 후 다시 시도해 주세요.");
        try {
            var result = client.post().uri("https://places.googleapis.com/v1/places:searchText")
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", "places.id,places.displayName,places.formattedAddress,places.location,places.types")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("textQuery", query.trim(), "languageCode", "ko", "pageSize", 8))
                    .retrieve().body(SearchResponse.class);
            var places = result == null || result.places() == null ? List.<GooglePlace>of() : result.places();
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(places.stream()
                    .filter(place -> place.id() != null && place.displayName() != null && place.location() != null)
                    .map(place -> new PlaceResult(place.id(), place.displayName().text(),
                            place.formattedAddress() == null ? "" : place.formattedAddress(),
                            place.location(), category(place.types())))
                    .toList());
        } catch (RestClientException exception) {
            // Never return upstream exceptions: they may contain the API key or request URL.
            return error(HttpStatus.BAD_GATEWAY, "장소 검색에 실패했어요. Places API 설정과 연결을 확인해 주세요.");
        }
    }

    @GetMapping("/image")
    public ResponseEntity<?> image(@RequestParam double latitude, @RequestParam double longitude,
                                   @RequestParam int zoom, @RequestParam int width) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || Math.abs(latitude) > 90
                || Math.abs(longitude) > 180 || zoom < 0 || zoom > 18 || width < 1 || width > 640)
            return error(HttpStatus.BAD_REQUEST, "지도 범위가 올바르지 않아요.");
        if (apiKey.isBlank()) return unavailable();
        if (!allowRequest(false)) return error(HttpStatus.TOO_MANY_REQUESTS, "지도 요청이 많아요. 잠시 후 다시 시도해 주세요.");
        try {
            var result = client.get().uri(builder -> builder
                    .scheme("https").host("maps.googleapis.com").path("/maps/api/staticmap")
                    .queryParam("center", latitude + "," + longitude).queryParam("zoom", zoom)
                    .queryParam("size", width + "x280").queryParam("scale", 2)
                    .queryParam("format", "png").queryParam("language", "ko")
                    .queryParam("key", apiKey).build()).retrieve().toEntity(byte[].class);
            if (result.getBody() == null || result.getHeaders().getContentType() == null
                    || !"image".equals(result.getHeaders().getContentType().getType()))
                return error(HttpStatus.BAD_GATEWAY, "지도를 불러오지 못했어요.");
            return ResponseEntity.ok().contentType(result.getHeaders().getContentType())
                    .cacheControl(CacheControl.noStore()).body(result.getBody());
        } catch (RestClientException exception) {
            return error(HttpStatus.BAD_GATEWAY, "지도를 불러오지 못했어요. Maps Static API 설정을 확인해 주세요.");
        }
    }

    private static String category(List<String> types) {
        if (types == null) return "기타";
        if (types.contains("lodging") || types.contains("hotel")) return "숙소";
        if (types.contains("cafe") || types.contains("coffee_shop")) return "카페";
        if (types.contains("restaurant") || types.contains("food")) return "음식점";
        if (types.contains("transit_station") || types.contains("airport")) return "교통";
        if (types.contains("tourist_attraction") || types.contains("park") || types.contains("museum")) return "볼거리";
        return "기타";
    }

    // Bound billable traffic for the single-process development proxy.
    private synchronized boolean allowRequest(boolean search) {
        if (System.nanoTime() - windowStarted >= Duration.ofMinutes(1).toNanos()) {
            windowStarted = System.nanoTime();
            searches = 0;
            images = 0;
        }
        return search ? ++searches <= 30 : ++images <= 120;
    }

    private static ResponseEntity<?> unavailable() {
        return error(HttpStatus.SERVICE_UNAVAILABLE, "장소 검색 서비스가 아직 준비되지 않았어요.");
    }

    private static ResponseEntity<?> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("message", message));
    }
}
