package com.travel.travelbackend.controller;

import com.travel.travelbackend.service.AuthService;
import com.travel.travelbackend.userapi.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;

@RestController @RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String COOKIE="wego_refresh";
    private final AuthService service;
    private final boolean secureCookie;
    private final Set<String> origins;
    public AuthController(AuthService service, @Value("${auth.cookie-secure:true}") boolean secureCookie,
            @Value("${users.allowed-origins:http://localhost:8081,http://localhost:8082}") String origins) {
        this.service=service; this.secureCookie=secureCookie;
        this.origins=new HashSet<>(Arrays.stream(origins.split(",")).map(String::trim).toList());
    }
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String,Object> body, HttpServletRequest request) {
        boolean web=web(body);
        if(web) checkOrigin(request);
        return tokens(service.login(body),web);
    }
    @PostMapping("/tokens/refresh")
    public ResponseEntity<?> refresh(@RequestBody(required=false) Map<String,Object> body, HttpServletRequest request) {
        body=body == null ? Map.of() : body;
        fields(body);
        boolean web=web(body) || !body.containsKey("refreshToken");
        if(web) checkOrigin(request);
        try { return tokens(service.refresh(web ? cookie(request) : Inputs.string(body,"refreshToken",128,false)),web); }
        catch(ApiException error) {
            if(!web || error.status!=401) throw error;
            return ResponseEntity.status(401).cacheControl(CacheControl.noStore()).header(HttpHeaders.SET_COOKIE,cookie("",0))
                    .body(Map.of("code",error.code,"message",error.getMessage()));
        }
    }
    @PostMapping("/logout")
    public ResponseEntity<?> logout(@AuthenticationPrincipal Jwt jwt, @RequestBody(required=false) Map<String,Object> body, HttpServletRequest request) {
        body=body == null ? Map.of() : body;
        fields(body);
        String cookie=cookie(request);
        if(web(body) || cookie != null) checkOrigin(request);
        service.logout(jwt,body.containsKey("refreshToken") ? Inputs.string(body,"refreshToken",128,false) : cookie);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.SET_COOKIE,cookie("",0)).body(ApiResponse.success(null));
    }
    private ResponseEntity<?> tokens(AuthService.Tokens tokens, boolean web) {
        var builder=ResponseEntity.ok().cacheControl(CacheControl.noStore());
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("accessToken",tokens.accessToken()); data.put("expiresIn",tokens.expiresIn());
        data.put("refreshExpiresAt",tokens.refreshExpiresAt());
        data.put("userId",tokens.userId());
        if(web) builder.header(HttpHeaders.SET_COOKIE,cookie(tokens.refreshToken(),Math.max(0,Duration.between(Instant.now(),tokens.refreshExpiresAt()).getSeconds())));
        else data.put("refreshToken",tokens.refreshToken());
        return builder.body(ApiResponse.success(data));
    }
    private String cookie(String value,long seconds) {
        return ResponseCookie.from(COOKIE,value).httpOnly(true).secure(secureCookie).sameSite("Strict")
                .path("/api/v1/auth").maxAge(seconds).build().toString();
    }
    private String cookie(HttpServletRequest request) {
        if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(COOKIE.equals(cookie.getName())) return cookie.getValue();
        return null;
    }
    private boolean web(Map<String,Object> body) {
        Object type=body.get("clientType");
        if(body.containsKey("clientType") && !Set.of("WEB","NATIVE").contains(type == null ? "" : type)) throw ApiException.invalid();
        return "WEB".equals(type);
    }
    private void fields(Map<String,Object> body) { if(!body.isEmpty()) Inputs.fields(body,"refreshToken","clientType"); }
    private void checkOrigin(HttpServletRequest request) {
        if(!origins.contains(request.getHeader("Origin"))) throw new ApiException(403,"ORIGIN_NOT_ALLOWED","허용되지 않은 요청 출처입니다.");
    }
}
