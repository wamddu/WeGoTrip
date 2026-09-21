package com.travel.travelbackend.userapi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
@Component
public class BankCipher {
    private final byte[] key;
    private final SecureRandom random = new SecureRandom();
    public BankCipher(@Value("${USER_BANK_ENCRYPTION_KEY:}") String configured) {
        key = configured.isBlank() ? null : Base64.getDecoder().decode(configured);
        if (key != null && key.length != 32) throw new IllegalArgumentException("USER_BANK_ENCRYPTION_KEY must encode 32 bytes");
    }
    public String encrypt(String value) {
        try {
            if (key == null) throw new IllegalStateException();
            byte[] iv = new byte[12]; random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            return Base64.getEncoder().encodeToString(iv) + "." + Base64.getEncoder().encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new ApiException(500, "INTERNAL_SERVER_ERROR", "계좌 정보를 처리할 수 없습니다."); }
    }
    public String mask(String encrypted) {
        String value = decrypt(encrypted);
        return value == null ? null : "*".repeat(value.length() - 4) + value.substring(value.length() - 4);
    }
    public String decrypt(String encrypted) {
        if (encrypted == null) return null;
        try {
            String[] parts = encrypted.split("\\.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, Base64.getDecoder().decode(parts[0])));
            String value = new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])), StandardCharsets.UTF_8);
            return value;
        } catch (Exception e) { throw new ApiException(500, "INTERNAL_SERVER_ERROR", "계좌 정보를 처리할 수 없습니다."); }
    }
}
