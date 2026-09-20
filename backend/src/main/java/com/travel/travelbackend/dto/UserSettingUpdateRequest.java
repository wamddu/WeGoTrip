package com.travel.travelbackend.dto;

public record UserSettingUpdateRequest(
        Boolean pushNotificationEnabled,
        Boolean locationSharingEnabled
) {
}