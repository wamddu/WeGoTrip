package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.PackingService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/packing-items")
public class PackingController {
    private final PackingService packing;
    public PackingController(PackingService packing) { this.packing=packing; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return result(200,packing.list(jwt,tripId,cursor,limit));
    }
    @GetMapping("/{itemId}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId) {
        return result(200,packing.get(jwt,tripId,itemId));
    }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,packing.create(jwt,tripId,key,body));
    }
    @PutMapping("/{itemId}") public Object update(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(200,packing.update(jwt,tripId,itemId,key,body));
    }
    @PutMapping("/{itemId}/completion") public Object complete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(200,packing.complete(jwt,tripId,itemId,key,body));
    }
    @DeleteMapping("/{itemId}") public Object delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String itemId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestParam String expectedStateToken) {
        return result(200,packing.delete(jwt,tripId,itemId,key,expectedStateToken));
    }
}
