package com.travel.travelbackend.exception;

public class PasswordSameAsCurrentException extends RuntimeException {

    public PasswordSameAsCurrentException() {
        super("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
    }
}