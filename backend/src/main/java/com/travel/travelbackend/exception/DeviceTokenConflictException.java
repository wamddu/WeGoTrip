package com.travel.travelbackend.exception;

public class DeviceTokenConflictException extends RuntimeException {

    public DeviceTokenConflictException() {
        super("이미 다른 기기에 등록된 FCM 토큰입니다.");
    }
}