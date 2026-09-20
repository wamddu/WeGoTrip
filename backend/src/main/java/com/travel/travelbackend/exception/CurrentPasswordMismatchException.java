package com.travel.travelbackend.exception;

public class CurrentPasswordMismatchException extends RuntimeException {

    public CurrentPasswordMismatchException() {
        super("현재 비밀번호가 일치하지 않습니다.");
    }
}