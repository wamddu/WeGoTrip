package com.travel.travelbackend.dto;

public record UserSettingResponse(
        boolean pushNotificationEnabled,
        boolean locationSharingEnabled
) {
}