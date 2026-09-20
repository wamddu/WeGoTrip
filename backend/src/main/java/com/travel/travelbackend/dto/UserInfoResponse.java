package com.travel.travelbackend.dto;

import java.time.Instant;

public record UserInfoResponse(
        String id,
        String email,
        String name,
        String role,
        String status,
        String bankAccountNumber,
        Instant createdAt,
        Instant updatedAt
) {
}