package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.ExpenseService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1/trips/{tripId}/expenses")
public class ExpenseController {
    private final ExpenseService expenses;
    public ExpenseController(ExpenseService expenses) { this.expenses=expenses; }
    private ResponseEntity<?> result(int status, Object data) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data));
    }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestParam(required=false) String cursor, @RequestParam(defaultValue="20") int limit) {
        return result(200,expenses.list(jwt,tripId,cursor,limit));
    }
    @GetMapping("/{expenseId}") public Object get(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String expenseId) {
        return result(200,expenses.get(jwt,tripId,expenseId));
    }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(201,expenses.create(jwt,tripId,key,body));
    }
    @PutMapping("/{expenseId}") public Object update(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String expenseId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestBody Map<String,Object> body) {
        return result(200,expenses.update(jwt,tripId,expenseId,key,body));
    }
    @DeleteMapping("/{expenseId}") public Object delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String tripId, @PathVariable String expenseId,
        @RequestHeader(value="Idempotency-Key",required=false) String key, @RequestParam String settlementRevision) {
        return result(200,expenses.delete(jwt,tripId,expenseId,key,settlementRevision));
    }
}
