package com.travel.travelbackend.service;

import com.travel.travelbackend.entity.*;
import com.travel.travelbackend.repository.*;
import com.travel.travelbackend.userapi.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;

@Service
@Transactional
public class UserService {
    private final UserRepository users;
    private final UserSettingRepository settings;
    private final UserDeviceRepository devices;
    private final UserConsentRepository consents;
    private final PasswordEncoder passwords;
    private final BankCipher bank;
    private final Clock clock;
    private final String consentVersion;
    public UserService(UserRepository users, UserSettingRepository settings, UserDeviceRepository devices,
                       UserConsentRepository consents, PasswordEncoder passwords, BankCipher bank, Clock clock,
                       @Value("${users.consent-version:1.0}") String consentVersion) {
        this.users = users; this.settings = settings; this.devices = devices; this.consents = consents;
        this.passwords = passwords; this.bank = bank; this.clock = clock; this.consentVersion = consentVersion;
    }
    public record Created(String id, String email, String name, Instant createdAt) {}
    public record Profile(String id, String email, String name, String role, String status, String loginProvider,
                          String bankAccountNumberMasked, Instant createdAt, Instant updatedAt) {}
    public record Settings(boolean pushNotificationEnabled, boolean locationSharingEnabled) {}
    public record Device(String id, String deviceType, Instant createdAt, Instant lastActiveAt) {}
    public record DeviceSaved(boolean created, Device data) {}
    public record Consent(String id, String consentType, String version, Instant agreedAt) {}

    public Created register(Map<String, Object> body) {
        Inputs.fields(body, "email", "name", "password", "consents");
        String email = Inputs.string(body, "email", 255, true).toLowerCase(Locale.ROOT);
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw ApiException.invalid();
        String name = Inputs.name(body);
        String password = Inputs.password(body, "password");
        if (!(body.get("consents") instanceof List<?> entries)) throw ApiException.invalid();
        Set<String> types = new HashSet<>();
        for (Object value : entries) {
            if (!(value instanceof Map<?, ?> consent) || consent.size() != 2 ||
                    !consent.keySet().equals(Set.of("consentType", "version")) ||
                    !(consent.get("consentType") instanceof String type) ||
                    !Set.of("TERMS_OF_SERVICE", "PRIVACY_POLICY", "MARKETING").contains(type) ||
                    !consentVersion.equals(consent.get("version")) || !types.add(type))
                throw new ApiException(400, "INVALID_CONSENT", "약관 종류, 버전 또는 중복 여부를 확인해 주세요.");
        }
        if (!types.containsAll(Set.of("TERMS_OF_SERVICE", "PRIVACY_POLICY")))
            throw new ApiException(400, "REQUIRED_CONSENT_MISSING", "필수 약관에 동의해 주세요.");
        if (users.existsByEmail(email)) throw emailConflict();
        Instant now = clock.instant();
        User user;
        try { user = users.saveAndFlush(new User(name, email, passwords.encode(password), now)); }
        catch (DataIntegrityViolationException e) { throw emailConflict(); }
        settings.save(new UserSetting(user));
        // Preserve submitted order so equal timestamps have a deterministic ID order.
        for (Object value : entries) {
            Map<?, ?> consent = (Map<?, ?>) value;
            consents.save(new UserConsent(user, (String) consent.get("consentType"), consentVersion, now));
        }
        return new Created(user.getId().toString(), email, name, now);
    }
    private ApiException emailConflict() { return new ApiException(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다."); }

    private User current(Jwt jwt) {
        if (jwt == null) throw ApiException.unauthorized();
        Long id;
        try { id = Inputs.id(jwt.getSubject()); } catch (ApiException e) { throw ApiException.unauthorized(); }
        User user = users.findLockedById(id).orElseThrow(ApiException::unauthorized);
        if (!"ACTIVE".equals(user.getStatus()))
            throw new ApiException(403, "ACCOUNT_UNAVAILABLE", "이용할 수 없는 계정입니다.");
        Object version = jwt.getClaims().get("tokenVersion");
        if (!(version instanceof Number number) || number.longValue() != user.getTokenVersion() ||
                number.doubleValue() != (double) number.longValue()) throw ApiException.unauthorized();
        return user;
    }
    private Profile profile(User user) {
        return new Profile(user.getId().toString(), user.getEmail(), user.getName(), user.getRole(), user.getStatus(),
                user.getLoginProvider(), bank.mask(user.getBankAccountEncrypted()), user.getCreatedAt(), user.getUpdatedAt());
    }
    public Profile me(Jwt jwt) { return profile(current(jwt)); }
    public Profile patch(Jwt jwt, Map<String, Object> body) {
        User user = current(jwt);
        Inputs.fields(body, "name", "bankAccountNumber");
        if (body.containsKey("name")) user.rename(Inputs.name(body), clock.instant());
        if (body.containsKey("bankAccountNumber")) {
            Object account = body.get("bankAccountNumber");
            if (account != null && (!(account instanceof String value) || !value.matches("[0-9]{8,30}"))) throw ApiException.invalid();
            user.bank(account == null ? null : bank.encrypt((String) account), clock.instant());
        }
        return profile(user);
    }
    public void password(Jwt jwt, Map<String, Object> body) {
        User user = current(jwt);
        Inputs.fields(body, "currentPassword", "newPassword");
        String currentPassword = Inputs.string(body, "currentPassword", 1000, false);
        if (!"LOCAL".equals(user.getLoginProvider()) || user.getPasswordHash() == null)
            throw new ApiException(409, "PASSWORD_CHANGE_NOT_SUPPORTED", "비밀번호를 변경할 수 없는 계정입니다.");
        if (currentPassword.getBytes(StandardCharsets.UTF_8).length > 72 || !passwords.matches(currentPassword, user.getPasswordHash()))
            throw new ApiException(400, "CURRENT_PASSWORD_MISMATCH", "현재 비밀번호가 일치하지 않습니다.");
        String next = Inputs.password(body, "newPassword");
        if (passwords.matches(next, user.getPasswordHash()))
            throw new ApiException(400, "PASSWORD_POLICY_VIOLATION", "기존 비밀번호와 다른 비밀번호를 입력해 주세요.");
        user.changePassword(passwords.encode(next), clock.instant());
    }
    public void withdraw(Jwt jwt) {
        User user = current(jwt);
        Object claim = jwt.getClaims().get("auth_time");
        long now = clock.instant().getEpochSecond();
        if (!(claim instanceof Number number) || number.doubleValue() != (double) number.longValue() ||
                number.longValue() > now || number.longValue() < now - 300)
            throw new ApiException(403, "REAUTHENTICATION_REQUIRED", "최근 5분 이내 재인증이 필요합니다.");
        user.withdraw(clock.instant());
        devices.deleteByUserId(user.getId());
        settings.findById(user.getId()).ifPresent(setting -> setting.update(false, false));
    }
    public Settings settings(Jwt jwt) {
        User user = current(jwt);
        return settings.findById(user.getId()).map(this::settingsView).orElse(new Settings(false, false));
    }
    private Settings settingsView(UserSetting setting) {
        return new Settings(setting.isPushNotificationEnabled(), setting.isLocationSharingEnabled());
    }
    public Settings patchSettings(Jwt jwt, Map<String, Object> body) {
        User user = current(jwt);
        Inputs.fields(body, "pushNotificationEnabled", "locationSharingEnabled");
        Boolean push = Inputs.bool(body, "pushNotificationEnabled");
        Boolean location = Inputs.bool(body, "locationSharingEnabled");
        UserSetting setting = settings.findById(user.getId()).orElseGet(() -> settings.save(new UserSetting(user)));
        setting.update(push, location);
        return settingsView(setting);
    }
    public DeviceSaved device(Jwt jwt, Map<String, Object> body) {
        User user = current(jwt);
        Inputs.fields(body, "deviceId", "fcmToken", "deviceType");
        String token = Inputs.string(body, "fcmToken", 500, false);
        if (token.isBlank()) throw ApiException.invalid();
        String type = Inputs.string(body, "deviceType", 10, false);
        if (!Set.of("ANDROID", "IOS", "WEB").contains(type)) throw ApiException.invalid();
        UserDevice device = body.containsKey("deviceId") ? devices.findByIdAndUserId(Inputs.id(body.get("deviceId")), user.getId()).orElseThrow(ApiException::notFound) : null;
        UserDevice existing = devices.findByFcmToken(token).orElse(null);
        if (existing != null) {
            if (!existing.getUser().getId().equals(user.getId()) || (device != null && !existing.getId().equals(device.getId()))) throw tokenConflict();
            if (device == null) device = existing;
        }
        boolean created = device == null;
        if (created) device = new UserDevice(user, clock.instant());
        device.update(token, type, clock.instant());
        try { devices.saveAndFlush(device); } catch (DataIntegrityViolationException e) { throw tokenConflict(); }
        return new DeviceSaved(created, new Device(device.getId().toString(), device.getDeviceType(), device.getCreatedAt(), device.getLastActiveAt()));
    }
    private ApiException tokenConflict() { return new ApiException(409, "DEVICE_TOKEN_CONFLICT", "이미 다른 기기에 등록된 토큰입니다."); }
    public void removeDevice(Jwt jwt, String id) {
        User user = current(jwt);
        devices.delete(devices.findByIdAndUserId(Inputs.id(id), user.getId()).orElseThrow(ApiException::notFound));
    }
    public Map<String, List<Consent>> consents(Jwt jwt) {
        User user = current(jwt);
        return Map.of("consents", consents.findByUserIdOrderByAgreedAtDescIdDesc(user.getId()).stream()
                .map(c -> new Consent(c.getId().toString(), c.getConsentType(), c.getVersion(), c.getAgreedAt())).toList());
    }
}
