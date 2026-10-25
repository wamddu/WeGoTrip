package com.travel.travelbackend.controller;

import com.travel.travelbackend.tripapi.NoticeService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/v1/trips/{tripId}/notices")
public class NoticeController {
    private final NoticeService notices;
    public NoticeController(NoticeService notices) { this.notices=notices; }
    private Object result(int status,Object data) { return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiResponse.success(data)); }
    @GetMapping public Object list(@AuthenticationPrincipal Jwt jwt,@PathVariable String tripId,
        @RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit) { return result(200,notices.list(jwt,tripId,cursor,limit)); }
    @GetMapping("/{noticeId}") public Object get(@AuthenticationPrincipal Jwt jwt,@PathVariable String tripId,@PathVariable String noticeId) { return result(200,notices.get(jwt,tripId,noticeId)); }
    @PostMapping public Object create(@AuthenticationPrincipal Jwt jwt,@PathVariable String tripId,
        @RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body) { return result(201,notices.create(jwt,tripId,key,body)); }
    @PutMapping("/{noticeId}") public Object update(@AuthenticationPrincipal Jwt jwt,@PathVariable String tripId,@PathVariable String noticeId,
        @RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> body) { return result(200,notices.update(jwt,tripId,noticeId,key,body)); }
    @DeleteMapping("/{noticeId}") public Object delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String tripId,@PathVariable String noticeId,
        @RequestHeader(value="Idempotency-Key",required=false) String key,@RequestParam String expectedVersion) { return result(200,notices.delete(jwt,tripId,noticeId,key,expectedVersion)); }
}
