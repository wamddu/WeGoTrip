package com.travel.travelbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserDeviceRequest(

        String deviceId,

        @NotBlank(message = "FCM 토큰은 필수입니다.")
        @Size(max = 500, message = "FCM 토큰은 500자 이하여야 합니다.")
        String fcmToken,

        @NotBlank(message = "기기 종류는 필수입니다.")
        String deviceType
) {
}