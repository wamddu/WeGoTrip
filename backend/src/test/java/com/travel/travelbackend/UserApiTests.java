package com.travel.travelbackend;

import com.travel.travelbackend.repository.*;
import com.travel.travelbackend.entity.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.*;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class UserApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired UserSettingRepository settings;
    @Autowired UserDeviceRepository devices;
    @Autowired UserConsentRepository consents;
    @Autowired PasswordEncoder passwords;
    @Autowired RefreshCredentialRepository refreshCredentials;
    private static final String BASE = "/api/v1/users";
    private static final String KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    @BeforeEach void clean() { refreshCredentials.deleteAll(); devices.deleteAll(); consents.deleteAll(); settings.deleteAll(); users.deleteAll(); }

    private String registration(String email) {
        return """
                {"name":"  여행자  ","email":"%s","password":"MyPassword123!",
                "consents":[{"consentType":"TERMS_OF_SERVICE","version":"1.0"},
                {"consentType":"PRIVACY_POLICY","version":"1.0"}]}
                """.formatted(email);
    }
    private String create(String email) throws Exception {
        var response = mvc.perform(post(BASE).contentType("application/json").content(registration(email)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").isString()).andExpect(jsonPath("$.data.password").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.data.id");
    }
    private String token(String id) throws Exception { return token(id, 0, Instant.now().getEpochSecond(), "wegotrip-api", 600); }
    private String loginResponse(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                .content("{\"email\":\""+email+"\",\"password\":\"MyPassword123!\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder refreshRequest(String raw) {
        return post("/api/v1/auth/tokens/refresh").contentType("application/json").content("{\"refreshToken\":\""+raw+"\"}");
    }
    @Test void refreshRequiresBodyCredentialAndRejectsInvalidInheritedBearer() throws Exception {
        String id=create("postman-refresh@example.com");
        String login=loginResponse("postman-refresh@example.com");
        String raw=JsonPath.read(login,"$.data.refreshToken");
        // Reproduce Postman's Bearer Token or inherited Authorization settings.
        mvc.perform(post("/api/v1/auth/tokens/refresh").header("Authorization","Bearer "+raw))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("로그인이 필요합니다."));
        mvc.perform(refreshRequest(raw).header("Authorization","Bearer "+raw))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(refreshRequest(raw).header("Authorization",token(id,0,0,"wegotrip-api",-120)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        // Rejected headers have not consumed the body credential. No Auth succeeds.
        String rotated=mvc.perform(refreshRequest(raw)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertNotEquals(raw,JsonPath.<String>read(rotated,"$.data.refreshToken"));
        mvc.perform(get(BASE+"/me").header("Authorization","Bearer "+JsonPath.<String>read(rotated,"$.data.accessToken")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
    }
    @Test void refreshRotatesPreservesAuthenticationTimeAndRevokesOnReplay() throws Exception {
        String id=create("rotate@example.com");
        String login=loginResponse("rotate@example.com");
        String original=JsonPath.read(login,"$.data.refreshToken");
        assertEquals(43,original.length());
        assertFalse(refreshCredentials.existsById(original));
        String rotated=mvc.perform(refreshRequest(original)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String next=JsonPath.read(rotated,"$.data.refreshToken"), access=JsonPath.read(rotated,"$.data.accessToken");
        assertNotEquals(original,next);
        assertEquals(JsonPath.<String>read(login,"$.data.refreshExpiresAt"),JsonPath.<String>read(rotated,"$.data.refreshExpiresAt"));
        assertEquals(SignedJWT.parse(JsonPath.<String>read(login,"$.data.accessToken")).getJWTClaimsSet().getLongClaim("auth_time"),
                SignedJWT.parse(access).getJWTClaimsSet().getLongClaim("auth_time"));
        mvc.perform(get(BASE+"/me").header("Authorization","Bearer "+access)).andExpect(status().isOk());
        mvc.perform(refreshRequest(original)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("REFRESH_TOKEN_REUSED"));
        assertEquals(1,users.findById(Long.valueOf(id)).orElseThrow().getTokenVersion());
        mvc.perform(refreshRequest(next)).andExpect(status().isUnauthorized());
        mvc.perform(get(BASE+"/me").header("Authorization","Bearer "+access)).andExpect(status().isUnauthorized());
        String newLogin=loginResponse("rotate@example.com");
        mvc.perform(refreshRequest(original)).andExpect(status().isUnauthorized());
        mvc.perform(refreshRequest(JsonPath.read(newLogin,"$.data.refreshToken"))).andExpect(status().isOk());
    }
    @Test void passwordChangeAndLogoutRejectRefreshAndExpiredCredentialsFail() throws Exception {
        String id=create("revoke@example.com"), login=loginResponse("revoke@example.com");
        String refresh=JsonPath.read(login,"$.data.refreshToken"), access=JsonPath.read(login,"$.data.accessToken");
        mvc.perform(put(BASE+"/me/password").header("Authorization","Bearer "+access).contentType("application/json")
                .content("{\"currentPassword\":\"MyPassword123!\",\"newPassword\":\"ChangedPassword123!\"}"))
                .andExpect(status().isOk());
        mvc.perform(refreshRequest(refresh)).andExpect(status().isUnauthorized());
        String other=create("logout-refresh@example.com"), otherLogin=loginResponse("logout-refresh@example.com");
        String otherRefresh=JsonPath.read(otherLogin,"$.data.refreshToken");
        mvc.perform(post("/api/v1/auth/logout").contentType("application/json").content("{\"refreshToken\":\""+otherRefresh+"\"}"))
                .andExpect(status().isOk());
        mvc.perform(refreshRequest(otherRefresh)).andExpect(status().isUnauthorized());
        String raw="a".repeat(43);
        String digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        refreshCredentials.save(new RefreshCredential(digest,Long.valueOf(other),1,Instant.now().minusSeconds(1000),Instant.now().minusSeconds(1)));
        mvc.perform(refreshRequest(raw)).andExpect(status().isUnauthorized());
    }
    @Test void refreshDoesNotCountAsRecentAuthenticationAndWithdrawalRevokesIt() throws Exception {
        String id=create("old-auth@example.com"), raw="b".repeat(43);
        String digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(raw.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        refreshCredentials.save(new RefreshCredential(digest,Long.valueOf(id),0,Instant.now().minusSeconds(600),Instant.now().plusSeconds(3600)));
        String rotated=mvc.perform(refreshRequest(raw)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mvc.perform(delete(BASE+"/me").header("Authorization","Bearer "+JsonPath.<String>read(rotated,"$.data.accessToken")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("REAUTHENTICATION_REQUIRED"));
        String login=loginResponse("old-auth@example.com");
        mvc.perform(delete(BASE+"/me").header("Authorization","Bearer "+JsonPath.<String>read(login,"$.data.accessToken"))).andExpect(status().isOk());
        mvc.perform(refreshRequest(JsonPath.read(login,"$.data.refreshToken"))).andExpect(status().isUnauthorized());
    }
    @Test void browserRefreshIsHttpOnlyAndRequiresTrustedOrigin() throws Exception {
        create("cookie@example.com");
        var response=mvc.perform(post("/api/v1/auth/login").header("Origin","http://localhost:8082").contentType("application/json")
                .content("{\"email\":\"cookie@example.com\",\"password\":\"MyPassword123!\",\"clientType\":\"WEB\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.refreshToken").doesNotExist())
                .andExpect(header().string("Access-Control-Allow-Credentials","true")).andReturn().getResponse();
        String setCookie=response.getHeader("Set-Cookie");
        assertTrue(setCookie.contains("HttpOnly")); assertTrue(setCookie.contains("SameSite=Strict")); assertTrue(setCookie.contains("Secure"));
        var cookie=new jakarta.servlet.http.Cookie("wego_refresh",setCookie.split(";",2)[0].split("=",2)[1]);
        mvc.perform(post("/api/v1/auth/tokens/refresh").cookie(cookie)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/tokens/refresh").cookie(cookie).header("Origin","https://evil.example")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/tokens/refresh").cookie(cookie).header("Origin","http://localhost:8082"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.refreshToken").doesNotExist());
        mvc.perform(post("/api/v1/auth/tokens/refresh").cookie(cookie).header("Origin","http://localhost:8082"))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Set-Cookie",org.hamcrest.Matchers.containsString("Max-Age=0")));
    }
    @Test void simultaneousRefreshCannotIssueTwoValidSuccessors() throws Exception {
        String id=create("concurrent-refresh@example.com");
        String raw=JsonPath.read(loginResponse("concurrent-refresh@example.com"),"$.data.refreshToken");
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> request=() -> { start.await(); return mvc.perform(refreshRequest(raw)).andReturn().getResponse().getStatus(); };
            var first=pool.submit(request); var second=pool.submit(request); start.countDown();
            assertEquals(Set.of(200,401),Set.of(first.get(10,java.util.concurrent.TimeUnit.SECONDS),second.get(10,java.util.concurrent.TimeUnit.SECONDS)));
        }
        assertEquals(1,users.findById(Long.valueOf(id)).orElseThrow().getTokenVersion());
    }
    private String token(String id, long version, long authTime, String audience, long ttl) throws Exception {
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), new JWTClaimsSet.Builder()
                .subject(id).issuer("wegotrip-auth").audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(5))).expirationTime(Date.from(Instant.now().plusSeconds(ttl)))
                .claim("tokenVersion", version).claim("auth_time", authTime).build());
        jwt.sign(new MACSigner(Base64.getDecoder().decode(KEY)));
        return "Bearer " + jwt.serialize();
    }
    @Test void registrationIsAtomicNormalizedAndPrivate() throws Exception {
        String id = create(" PERSON@Example.COM ");
        User user = users.findById(Long.valueOf(id)).orElseThrow();
        assertEquals("person@example.com", user.getEmail());
        assertEquals("여행자", user.getName());
        assertTrue(passwords.matches("MyPassword123!", user.getPasswordHash()));
        assertNotEquals("MyPassword123!", user.getPasswordHash());
        assertEquals(1, settings.count()); assertEquals(2, consents.count());
        mvc.perform(get(BASE + "/me").header("Authorization", token(id)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.role").value("USER"))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.bankAccountNumberMasked").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(post(BASE).contentType("application/json").content(registration("person@example.com")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
        assertEquals(1, users.count()); assertEquals(2, consents.count());
    }
    @Test void realLoginCorsAndLogoutRevokeIssuedToken() throws Exception {
        create("login@example.com");
        mvc.perform(options("/api/v1/auth/login").header("Origin", "http://localhost:8081")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
        mvc.perform(options("/api/v1/users/me").header("Origin", "https://untrusted.example")
                .header("Access-Control-Request-Method", "PATCH")).andExpect(status().isForbidden());
        for (String email : List.of("login@example.com", "missing@example.com")) {
            mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                    .content("{\"email\":\""+email+"\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }
        String response=mvc.perform(post("/api/v1/auth/login").contentType("application/json")
                .content("{\"email\":\" LOGIN@EXAMPLE.COM \",\"password\":\"MyPassword123!\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        String bearer="Bearer "+JsonPath.<String>read(response,"$.data.accessToken");
        mvc.perform(get(BASE+"/me").header("Authorization",bearer)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/logout").header("Authorization",bearer)).andExpect(status().isOk());
        mvc.perform(get(BASE+"/me").header("Authorization",bearer)).andExpect(status().isUnauthorized());
    }
    @Test void registrationRejectsMissingDuplicateAndUnsupportedInputs() throws Exception {
        for (String body : List.of(
                registration("a@b.com").replace("\"name\":", "\"role\":\"ADMIN\",\"name\":"),
                registration("a@b.com").replace("\"name\":\"  여행자  \"", "\"name\":null"))) {
            mvc.perform(post(BASE).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        mvc.perform(post(BASE).contentType("application/json").content(registration("a@b.com").replace("PRIVACY_POLICY", "TERMS_OF_SERVICE")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CONSENT"));
        mvc.perform(post(BASE).contentType("application/json").content(registration("a@b.com").replace("PRIVACY_POLICY", "MARKETING")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("REQUIRED_CONSENT_MISSING"));
        mvc.perform(post(BASE).contentType("application/json").content(registration("a@b.com").replace("MyPassword123!", "short")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PASSWORD_POLICY_VIOLATION"));
        assertEquals(0, users.count()); assertEquals(0, settings.count()); assertEquals(0, consents.count());
    }
    @Test void bearerSignatureExpiryAudienceAndIdentityAreVerified() throws Exception {
        String id = create("a@b.com");
        for (String authorization : List.of("Bearer invalid", token(id, 0, 0, "other-api", 600),
                token(id, 0, 0, "wegotrip-api", -120), token("999999"), token(id, 9, 0, "wegotrip-api", 600))) {
            mvc.perform(get(BASE + "/me").header("Authorization", authorization))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                    .andExpect(jsonPath("$.data").doesNotExist());
        }
        mvc.perform(get(BASE + "/me")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }
    @Test void partialProfileSupportsOmissionNullAndEncryptedBankAccount() throws Exception {
        String id = create("a@b.com"), bearer = token(id);
        mvc.perform(patch(BASE + "/me").header("Authorization", bearer).contentType("application/json")
                .content("{\"bankAccountNumber\":\"001234567890\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.bankAccountNumberMasked").value("********7890"));
        String encrypted = users.findById(Long.valueOf(id)).orElseThrow().getBankAccountEncrypted();
        assertFalse(encrypted.contains("001234567890"));
        mvc.perform(get(BASE + "/me").header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.bankAccountNumber").value("001234567890"));
        String other = create("other-bank@example.com");
        mvc.perform(get(BASE + "/me").header("Authorization", token(other)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.bankAccountNumber").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(patch(BASE + "/me").header("Authorization", bearer).contentType("application/json").content("{\"name\":\"새이름\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.bankAccountNumberMasked").value("********7890"));
        mvc.perform(patch(BASE + "/me").header("Authorization", bearer).contentType("application/json").content("{\"bankAccountNumber\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.bankAccountNumberMasked").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.bankAccountNumber").value(org.hamcrest.Matchers.nullValue()));
        for (String body : List.of("{}", "{\"name\":null}", "{\"role\":\"ADMIN\"}", "{\"bankAccountNumber\":12345678}"))
            mvc.perform(patch(BASE + "/me").header("Authorization", bearer).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }
    @Test void invalidPatchRollsBackEarlierFields() throws Exception {
        String id = create("a@b.com");
        mvc.perform(patch(BASE + "/me").header("Authorization", token(id)).contentType("application/json")
                .content("{\"name\":\"바뀌면안됨\",\"bankAccountNumber\":\"bad\"}")).andExpect(status().isBadRequest());
        assertEquals("여행자", users.findById(Long.valueOf(id)).orElseThrow().getName());
    }
    @Test void settingsEnforceBooleansAndDefaultMissingRows() throws Exception {
        String id = create("a@b.com"), bearer = token(id);
        settings.deleteById(Long.valueOf(id));
        mvc.perform(get(BASE + "/me/settings").header("Authorization", bearer))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.pushNotificationEnabled").value(false));
        mvc.perform(patch(BASE + "/me/settings").header("Authorization", bearer).contentType("application/json")
                .content("{\"pushNotificationEnabled\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.locationSharingEnabled").value(false));
        for (String body : List.of("{}", "{\"pushNotificationEnabled\":null}", "{\"pushNotificationEnabled\":\"true\"}", "{\"unknown\":true}"))
            mvc.perform(patch(BASE + "/me/settings").header("Authorization", bearer).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        assertEquals(1, settings.count());
    }
    @Test void passwordChangeInvalidatesOldTokensAndChecksCurrentPassword() throws Exception {
        String id = create("a@b.com"), bearer = token(id);
        mvc.perform(put(BASE + "/me/password").header("Authorization", bearer).contentType("application/json")
                .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"NextPassword123!\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CURRENT_PASSWORD_MISMATCH"));
        mvc.perform(put(BASE + "/me/password").header("Authorization", bearer).contentType("application/json")
                .content("{\"currentPassword\":\"MyPassword123!\",\"newPassword\":\"NextPassword123!\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
        assertTrue(passwords.matches("NextPassword123!", users.findById(Long.valueOf(id)).orElseThrow().getPasswordHash()));
        mvc.perform(get(BASE + "/me").header("Authorization", bearer)).andExpect(status().isUnauthorized());
        mvc.perform(get(BASE + "/me").header("Authorization", token(id, 1, 0, "wegotrip-api", 600))).andExpect(status().isOk());
    }
    @Test void deviceTokensAreCaseSensitiveWithoutHashes() throws Exception {
        String first = create("case1@example.com"), second = create("case2@example.com");
        String upper = "{\"fcmToken\":\"CaseSensitiveToken\",\"deviceType\":\"ANDROID\"}";
        String lower = "{\"fcmToken\":\"casesensitivetoken\",\"deviceType\":\"ANDROID\"}";
        mvc.perform(post(BASE + "/me/devices").header("Authorization", token(first)).contentType("application/json").content(upper))
                .andExpect(status().isCreated());
        mvc.perform(post(BASE + "/me/devices").header("Authorization", token(second)).contentType("application/json").content(lower))
                .andExpect(status().isCreated());
        mvc.perform(post(BASE + "/me/devices").header("Authorization", token(second)).contentType("application/json").content(upper))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEVICE_TOKEN_CONFLICT"));
        assertEquals(2, devices.count());
        assertEquals(Long.valueOf(first), devices.findByFcmToken("CaseSensitiveToken").orElseThrow().getUser().getId());
        assertEquals(Long.valueOf(second), devices.findByFcmToken("casesensitivetoken").orElseThrow().getUser().getId());
    }
    @Test void deviceUpsertEnforcesOwnershipAndUniqueTokens() throws Exception {
        String first = create("first@b.com"), second = create("second@b.com"), bearer = token(first);
        String body = "{\"fcmToken\":\"example-token\",\"deviceType\":\"ANDROID\"}";
        String result = mvc.perform(post(BASE + "/me/devices").header("Authorization", bearer).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.fcmToken").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String deviceId = JsonPath.read(result, "$.data.id");
        mvc.perform(post(BASE + "/me/devices").header("Authorization", bearer).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(deviceId));
        mvc.perform(post(BASE + "/me/devices").header("Authorization", token(second)).contentType("application/json").content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEVICE_TOKEN_CONFLICT"));
        mvc.perform(post(BASE + "/me/devices").header("Authorization", token(second)).contentType("application/json")
                .content("{\"deviceId\":\"" + deviceId + "\",\"fcmToken\":\"different\",\"deviceType\":\"IOS\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete(BASE + "/me/devices/" + deviceId).header("Authorization", token(second))).andExpect(status().isNotFound());
        mvc.perform(delete(BASE + "/me/devices/" + deviceId).header("Authorization", bearer)).andExpect(status().isOk());
        mvc.perform(delete(BASE + "/me/devices/" + deviceId).header("Authorization", bearer)).andExpect(status().isNotFound());
        assertEquals(0, devices.count());
    }
    @Test void withdrawalRequiresRecentAuthenticationAndRevokesAccess() throws Exception {
        String id = create("a@b.com"), bearer = token(id);
        mvc.perform(delete(BASE + "/me").header("Authorization", token(id, 0, Instant.now().minusSeconds(600).getEpochSecond(), "wegotrip-api", 600)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("REAUTHENTICATION_REQUIRED"));
        mvc.perform(post(BASE + "/me/devices").header("Authorization", bearer).contentType("application/json")
                .content("{\"fcmToken\":\"token\",\"deviceType\":\"WEB\"}")).andExpect(status().isCreated());
        mvc.perform(delete(BASE + "/me").header("Authorization", bearer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
        User user = users.findById(Long.valueOf(id)).orElseThrow();
        assertEquals("WITHDRAWN", user.getStatus()); assertNull(user.getPasswordHash()); assertEquals(0, devices.count());
        assertEquals(2, consents.count());
        mvc.perform(get(BASE + "/me").header("Authorization", bearer))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_UNAVAILABLE"));
    }
    @Test void consentsArePrivateAndSortedByDescendingIdOnTies() throws Exception {
        String first = create("first@b.com"), second = create("second@b.com");
        mvc.perform(get(BASE + "/me/consents").header("Authorization", token(first)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.consents.length()").value(2))
                .andExpect(jsonPath("$.data.consents[0].consentType").value("PRIVACY_POLICY"));
        consents.deleteAll(consents.findByUserIdOrderByAgreedAtDescIdDesc(Long.valueOf(second)));
        mvc.perform(get(BASE + "/me/consents").header("Authorization", token(second)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.consents").isEmpty());
    }
}
