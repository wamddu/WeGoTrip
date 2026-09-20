package com.travel.travelbackend.dto;

import java.time.Instant;

public record UserDeviceResponse(
        String id,
        String deviceType,
        Instant createdAt,
        Instant lastActiveAt
) {
}