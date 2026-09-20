package com.travel.travelbackend.dto;

import java.util.List;

public record UserConsentListResponse(
        List<UserConsentResponse> consents
) {
}