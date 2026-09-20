package com.travel.travelbackend.service;

import com.travel.travelbackend.entity.*;
import com.travel.travelbackend.repository.*;
import com.travel.travelbackend.userapi.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.*;

@Service
public class AuthService {
    private final UserRepository users;
    private final RefreshCredentialRepository credentials;
    private final UserService userService;
    private final PasswordEncoder passwords;
    private final Clock clock;
    private final String secret, issuer, audience, dummyHash;
    private final SecureRandom random = new SecureRandom();
    public record Tokens(String accessToken, String refreshToken, long expiresIn, Instant refreshExpiresAt, String userId) {}
    public AuthService(UserRepository users, RefreshCredentialRepository credentials, UserService userService,
            PasswordEncoder passwords, Clock clock, @Value("${USER_JWT_SECRET:}") String secret,
            @Value("${users.jwt-issuer:wegotrip-auth}") String issuer,
            @Value("${users.jwt-audience:wegotrip-api}") String audience) {
        this.users=users; this.credentials=credentials; this.userService=userService; this.passwords=passwords;
        this.clock=clock; this.secret=secret; this.issuer=issuer; this.audience=audience;
        dummyHash=passwords.encode(UUID.randomUUID().toString());
    }
    @Transactional
    public Tokens login(Map<String,Object> body) {
        Inputs.fields(body,"email","password","clientType");
        String email=Inputs.string(body,"email",255,true).toLowerCase(Locale.ROOT);
        String password=Inputs.string(body,"password",1000,false);
        configured();
        var user=users.findByEmail(email).orElse(null);
        String hash=user == null ? null : user.getPasswordHash();
        boolean supported=hash != null && hash.matches("\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}");
        boolean matched=password.getBytes(StandardCharsets.UTF_8).length <= 72 && passwords.matches(password,supported ? hash : dummyHash);
        if(user == null || !supported || !matched || !"ACTIVE".equals(user.getStatus()) || !"LOCAL".equals(user.getLoginProvider()))
            throw new ApiException(401,"INVALID_CREDENTIALS","이메일 또는 비밀번호를 확인해 주세요.");
        Instant now=clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        return issue(user,now,now.plus(Duration.ofDays(30)));
    }
    @Transactional(noRollbackFor = ApiException.class)
    public Tokens refresh(String raw) {
        configured();
        String digest=digest(raw);
        Long owner=credentials.ownerOf(digest).orElseThrow(AuthService::invalidRefresh);
        var user=users.findLockedById(owner).orElseThrow(AuthService::invalidRefresh);
        var credential=credentials.findLockedByDigest(digest).orElseThrow(AuthService::invalidRefresh);
        if(!"ACTIVE".equals(user.getStatus()) || credential.getTokenVersion()!=user.getTokenVersion() ||
                !credential.getExpiresAt().isAfter(clock.instant())) throw invalidRefresh();
        if(credential.isConsumed()) {
            // This revocation must commit despite the 401 response. Old-version replays
            // cannot revoke a newly authenticated session.
            user.revokeSessions();
            throw new ApiException(401,"REFRESH_TOKEN_REUSED","로그인 정보가 재사용되어 다시 로그인이 필요합니다.");
        }
        credential.consume();
        return issue(user,credential.getAuthenticatedAt(),credential.getExpiresAt());
    }
    @Transactional
    public void logout(Jwt jwt, String raw) {
        if(jwt != null) {
            userService.me(jwt);
            users.findLockedById(Long.valueOf(jwt.getSubject())).orElseThrow().revokeSessions();
        } else if(raw != null && raw.matches("[A-Za-z0-9_-]{43}")) {
            String digest=digest(raw);
            credentials.ownerOf(digest).flatMap(users::findLockedById).ifPresent(user -> {
                var credential=credentials.findLockedByDigest(digest).orElseThrow();
                if(credential.getTokenVersion()==user.getTokenVersion()) user.revokeSessions();
            });
        }
    }
    private Tokens issue(User user, Instant authenticatedAt, Instant refreshExpiresAt) {
        byte[] bytes=new byte[32]; random.nextBytes(bytes);
        String raw=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now=clock.instant();
        try {
            var jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.HS256),new JWTClaimsSet.Builder()
                    .subject(user.getId().toString()).issuer(issuer).audience(audience)
                    .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(1800)))
                    .jwtID(UUID.randomUUID().toString()).claim("tokenVersion",user.getTokenVersion())
                    .claim("auth_time",authenticatedAt.getEpochSecond()).build());
            jwt.sign(new MACSigner(Base64.getDecoder().decode(secret)));
            credentials.save(new RefreshCredential(digest(raw),user.getId(),user.getTokenVersion(),authenticatedAt,refreshExpiresAt));
            return new Tokens(jwt.serialize(),raw,1800,refreshExpiresAt,user.getId().toString());
        } catch(JOSEException e) { throw new IllegalStateException("Token signing failed",e); }
    }
    private void configured() {
        if(secret.isBlank()) throw new ApiException(503,"AUTH_NOT_CONFIGURED","로그인 서비스가 준비되지 않았습니다.");
    }
    private static ApiException invalidRefresh() { return new ApiException(401,"INVALID_REFRESH_TOKEN","다시 로그인해 주세요."); }
    private static String digest(String raw) {
        if(raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) throw invalidRefresh();
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
