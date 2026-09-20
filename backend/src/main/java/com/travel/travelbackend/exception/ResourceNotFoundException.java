package com.travel.travelbackend.exception;

public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException() {
        super("대상을 찾을 수 없습니다.");
    }
}