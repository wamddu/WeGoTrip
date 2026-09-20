package com.travel.travelbackend.dto;

public record UserDeviceUpsertResult(
        boolean created,
        UserDeviceResponse data
) {
}