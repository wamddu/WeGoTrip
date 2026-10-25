package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.PlaceService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/saved-places")
public class PlaceController {
    private final PlaceService places;
    public PlaceController(PlaceService places) { this.places = places; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return result(200,places.list(jwt,tripId,cursor,limit));
    }
    @GetMapping("/{placeId}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String placeId) {
        return result(200,places.get(jwt,tripId,placeId));
    }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,places.create(jwt,tripId,key,body));
    }
    @PutMapping("/{placeId}") public Object update(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String placeId, @RequestBody Map<String,Object> body) {
        return result(200,places.update(jwt,tripId,placeId,body));
    }
    @DeleteMapping("/{placeId}") public Object delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String placeId) {
        places.delete(jwt,tripId,placeId);
        return result(200,null);
    }
}
