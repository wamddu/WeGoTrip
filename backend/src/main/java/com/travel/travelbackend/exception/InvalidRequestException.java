package com.travel.travelbackend.exception;

public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException() {
        super("요청 값을 확인해주세요.");
    }
}