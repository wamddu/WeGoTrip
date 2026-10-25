package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.ItineraryService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/itinerary-items")
public class ItineraryController {
    private final ItineraryService itineraries;
    public ItineraryController(ItineraryService itineraries) { this.itineraries = itineraries; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return result(200,itineraries.list(jwt,tripId,cursor,limit));
    }
    @GetMapping("/{itemId}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId) {
        return result(200,itineraries.get(jwt,tripId,itemId));
    }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,itineraries.create(jwt,tripId,key,body));
    }
    @PutMapping("/{itemId}") public Object update(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId, @RequestBody Map<String,Object> body) {
        return result(200,itineraries.update(jwt,tripId,itemId,body));
    }
    @DeleteMapping("/{itemId}") public Object delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId) {
        itineraries.delete(jwt,tripId,itemId);
        return result(200,null);
    }
}
