package com.travel.travelbackend.dto;

import java.time.Instant;

public record UserConsentResponse(
        String id,
        String consentType,
        String version,
        Instant agreedAt
) {
}