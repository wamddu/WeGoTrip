package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.SettlementService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1/trips/{tripId}/settlement")
public class SettlementController {
    private final SettlementService settlement;
    public SettlementController(SettlementService settlement) { this.settlement=settlement; }
    private ResponseEntity<?> result(Object data) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId) {
        return result(settlement.get(jwt,tripId));
    }
    @PutMapping("/confirmations") public Object confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(settlement.confirm(jwt,tripId,key,body));
    }
}
