package com.travel.travelbackend.userapi;

import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.crypto.password.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import javax.crypto.spec.SecretKeySpec;
import java.time.*;
import java.util.Base64;

@Configuration
public class UserSecurity {
    @Bean Clock userClock() { return Clock.systemUTC(); }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean JwtDecoder userJwtDecoder(@Value("${USER_JWT_SECRET:}") String secret,
                                   @Value("${users.jwt-issuer:wegotrip-auth}") String issuer,
                                   @Value("${users.jwt-audience:wegotrip-api}") String audience) {
        if (secret.isBlank()) return token -> { throw new BadJwtException("JWT verification is not configured"); };
        byte[] key = Base64.getDecoder().decode(secret);
        if (key.length < 32) throw new IllegalArgumentException("USER_JWT_SECRET must encode at least 32 bytes");
        var decoder = NimbusJwtDecoder.withSecretKey(new SecretKeySpec(key, "HmacSHA256")).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> required = jwt -> {
            Instant now = Instant.now();
            boolean valid = jwt.getExpiresAt() != null && jwt.getExpiresAt().isAfter(now) &&
                    jwt.getIssuedAt() != null && !jwt.getIssuedAt().isAfter(now.plusSeconds(30)) &&
                    jwt.getExpiresAt().isAfter(jwt.getIssuedAt()) && jwt.getAudience().contains(audience) &&
                    jwt.getSubject() != null && jwt.getSubject().matches("[1-9][0-9]{0,18}");
            return valid ? OAuth2TokenValidatorResult.success() :
                    OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), required));
        return decoder;
    }
    @Bean @Order(1)
    SecurityFilterChain userApi(HttpSecurity http, JwtDecoder decoder,
            @Value("${users.allowed-origins:http://localhost:8081,http://localhost:8082}") String origins) throws Exception {
        var cors = new org.springframework.web.cors.CorsConfiguration();
        cors.setAllowedOrigins(java.util.Arrays.stream(origins.split(",")).map(String::trim).toList());
        cors.setAllowedMethods(java.util.List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(java.util.List.of("Content-Type", "Authorization"));
        cors.setAllowCredentials(true);
        var source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**", cors);
        return http.securityMatcher("/api/v1/users", "/api/v1/users/**", "/api/v1/auth/**")
                .cors(config -> config.configurationSource(source))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/users", "/api/v1/auth/login", "/api/v1/auth/tokens/refresh", "/api/v1/auth/logout").permitAll().anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(decoder))
                        .authenticationEntryPoint((request, response, e) -> {
                            response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"로그인이 필요합니다.\"}");
                        }))
                .build();
    }
    @Bean @Order(2)
    SecurityFilterChain existingRoutes(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }
}
