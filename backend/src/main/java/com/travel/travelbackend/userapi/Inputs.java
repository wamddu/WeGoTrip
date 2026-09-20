package com.travel.travelbackend.userapi;
import java.util.*;
import java.nio.charset.StandardCharsets;
public final class Inputs {
    private Inputs() {}
    public static void fields(Map<String, Object> body, String... allowed) {
        if (body == null || body.isEmpty() || !Set.of(allowed).containsAll(body.keySet())) throw ApiException.invalid();
    }
    public static String string(Map<String, Object> body, String key, int max, boolean trim) {
        if (!(body.get(key) instanceof String value)) throw ApiException.invalid();
        if (trim) value = value.strip();
        if (value.isEmpty() || value.length() > max) throw ApiException.invalid();
        return value;
    }
    public static String name(Map<String, Object> body) { return string(body, "name", 50, true); }
    public static Long id(Object value) {
        if (!(value instanceof String text) || !text.matches("[1-9][0-9]{0,18}")) throw ApiException.invalid();
        try { return Long.valueOf(text); } catch (NumberFormatException e) { throw ApiException.invalid(); }
    }
    public static Boolean bool(Map<String, Object> body, String key) {
        if (!body.containsKey(key)) return null;
        if (!(body.get(key) instanceof Boolean value)) throw ApiException.invalid();
        return value;
    }
    public static String password(Map<String, Object> body, String key) {
        if (!(body.get(key) instanceof String value) || value.length() < 10 || value.length() > 64 ||
                value.getBytes(StandardCharsets.UTF_8).length > 72 || !value.matches("(?s).*[A-Za-z].*") || !value.matches("(?s).*[0-9].*"))
            throw new ApiException(400, "PASSWORD_POLICY_VIOLATION", "비밀번호는 영문과 숫자를 포함한 10~64자, UTF-8 72바이트 이하여야 합니다.");
        return value;
    }
}
