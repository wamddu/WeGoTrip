package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.PartyService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/parties")
public class PartyController {
    private final PartyService parties;
    public PartyController(PartyService parties) { this.parties = parties; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return result(200, parties.list(jwt, tripId, cursor, limit));
    }
    @GetMapping("/{partyId}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String partyId) {
        return result(200, parties.get(jwt, tripId, partyId));
    }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201, parties.create(jwt, tripId, key, body));
    }
    @PutMapping("/{partyId}") public Object update(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String partyId, @RequestBody Map<String,Object> body) {
        return result(200, parties.update(jwt, tripId, partyId, body));
    }
    @DeleteMapping("/{partyId}") public Object delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String partyId) {
        parties.delete(jwt, tripId, partyId);
        return result(200, null);
    }
}
