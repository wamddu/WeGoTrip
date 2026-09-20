package com.travel.travelbackend.service;

import com.travel.travelbackend.dto.UserSettingResponse;
import com.travel.travelbackend.dto.UserSettingUpdateRequest;
import com.travel.travelbackend.entity.UserSetting;
import com.travel.travelbackend.repository.UserSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserSettingService {

    private final UserSettingRepository userSettingRepository;

    public UserSettingService(
            UserSettingRepository userSettingRepository
    ) {
        this.userSettingRepository = userSettingRepository;
    }

    @Transactional
    public UserSettingResponse getSettings(Long userId) {

        UserSetting setting =
                userSettingRepository.findById(userId)
                        .orElseGet(() ->
                                userSettingRepository.save(
                                        new UserSetting(userId)
                                )
                        );

        return new UserSettingResponse(
                setting.isPushNotificationEnabled(),
                setting.isLocationSharingEnabled()
        );
    }

    @Transactional
    public UserSettingResponse updateSettings(
            Long userId,
            UserSettingUpdateRequest request
    ) {

        UserSetting setting =
                userSettingRepository.findById(userId)
                        .orElseGet(() ->
                                userSettingRepository.save(
                                        new UserSetting(userId)
                                )
                        );

        setting.updateSettings(
                request.pushNotificationEnabled(),
                request.locationSharingEnabled()
        );

        return new UserSettingResponse(
                setting.isPushNotificationEnabled(),
                setting.isLocationSharingEnabled()
        );
    }
}