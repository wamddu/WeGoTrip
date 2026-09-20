package com.travel.travelbackend.exception;

public class TokenRevokedException extends RuntimeException {

    public TokenRevokedException() {
        super("폐기된 토큰입니다.");
    }
}