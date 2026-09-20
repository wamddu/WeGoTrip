package com.travel.travelbackend.userapi;
public class ApiException extends RuntimeException {
    public final int status;
    public final String code;
    public ApiException(int status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    public static ApiException invalid() { return new ApiException(400, "INVALID_REQUEST", "요청 인자의 형식이나 값이 올바르지 않습니다."); }
    public static ApiException unauthorized() { return new ApiException(401, "UNAUTHORIZED", "로그인이 필요합니다."); }
    public static ApiException notFound() { return new ApiException(404, "RESOURCE_NOT_FOUND", "대상을 찾을 수 없습니다."); }
}
