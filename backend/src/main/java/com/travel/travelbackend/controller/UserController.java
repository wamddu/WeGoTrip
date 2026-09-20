package com.travel.travelbackend.controller;

import com.travel.travelbackend.service.UserService;
import com.travel.travelbackend.userapi.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private final UserService service;
    public UserController(UserService service) { this.service = service; }
    @PostMapping public ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.register(body)));
    }
    @GetMapping("/me") public ApiResponse<?> me(@AuthenticationPrincipal Jwt jwt) { return ApiResponse.success(service.me(jwt)); }
    @PatchMapping("/me") public ApiResponse<?> patch(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        return ApiResponse.success(service.patch(jwt, body));
    }
    @PutMapping("/me/password") public ApiResponse<?> password(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        service.password(jwt, body); return ApiResponse.success(null);
    }
    @DeleteMapping("/me") public ApiResponse<?> withdraw(@AuthenticationPrincipal Jwt jwt) {
        service.withdraw(jwt); return ApiResponse.success(null);
    }
    @GetMapping("/me/settings") public ApiResponse<?> settings(@AuthenticationPrincipal Jwt jwt) { return ApiResponse.success(service.settings(jwt)); }
    @PatchMapping("/me/settings") public ApiResponse<?> settings(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        return ApiResponse.success(service.patchSettings(jwt, body));
    }
    @PostMapping("/me/devices") public ResponseEntity<?> device(@AuthenticationPrincipal Jwt jwt, @RequestBody Map<String, Object> body) {
        var result = service.device(jwt, body);
        return ResponseEntity.status(result.created() ? 201 : 200).body(ApiResponse.success(result.data()));
    }
    @DeleteMapping("/me/devices/{deviceId}") public ApiResponse<?> removeDevice(@AuthenticationPrincipal Jwt jwt, @PathVariable String deviceId) {
        service.removeDevice(jwt, deviceId); return ApiResponse.success(null);
    }
    @GetMapping("/me/consents") public ApiResponse<?> consents(@AuthenticationPrincipal Jwt jwt) { return ApiResponse.success(service.consents(jwt)); }
}
