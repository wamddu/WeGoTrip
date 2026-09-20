package com.travel.travelbackend.exception;

public class AccountInactiveException extends RuntimeException {

    public AccountInactiveException() {
        super("비활성화된 계정입니다.");
    }
}