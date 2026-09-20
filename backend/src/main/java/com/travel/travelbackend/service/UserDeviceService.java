package com.travel.travelbackend.service;

import com.travel.travelbackend.dto.UserDeviceRequest;
import com.travel.travelbackend.dto.UserDeviceResponse;
import com.travel.travelbackend.dto.UserDeviceUpsertResult;
import com.travel.travelbackend.entity.UserDevice;
import com.travel.travelbackend.exception.DeviceTokenConflictException;
import com.travel.travelbackend.exception.ResourceNotFoundException;
import com.travel.travelbackend.repository.UserDeviceRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;

@Service
public class UserDeviceService {

    private final UserDeviceRepository userDeviceRepository;

    public UserDeviceService(
            UserDeviceRepository userDeviceRepository
    ) {
        this.userDeviceRepository = userDeviceRepository;
    }

    @Transactional
    public UserDeviceUpsertResult registerOrUpdate(
            Long userId,
            UserDeviceRequest request
    ) {

        UserDevice userDevice;
        boolean created = false;

        // 1. deviceId가 있는 경우 → 해당 기기 갱신
        if (request.deviceId() != null) {

            Long deviceId;

            try {
                deviceId = Long.valueOf(request.deviceId());
            } catch (NumberFormatException e) {
                throw new ResourceNotFoundException();
            }

            userDevice = userDeviceRepository.findById(deviceId)
                    .filter(device ->
                            device.getUserId().equals(userId)
                    )
                    .orElseThrow(ResourceNotFoundException::new);

            // 동일 FCM 토큰을 다른 user_device가 사용 중인지 확인
            userDeviceRepository.findByFcmToken(request.fcmToken())
                    .filter(device ->
                            !device.getId().equals(userDevice.getId())
                    )
                    .ifPresent(device -> {
                        throw new DeviceTokenConflictException();
                    });

            userDevice.updateDevice(
                    request.fcmToken(),
                    request.deviceType()
            );

        } else {

            // 2. deviceId가 없는 경우
            UserDevice existingDevice =
                    userDeviceRepository
                            .findByUserIdAndFcmToken(
                                    userId,
                                    request.fcmToken()
                            )
                            .orElse(null);

            if (existingDevice != null) {

                // 이미 본인에게 등록된 FCM Token → 기존 기기 갱신
                userDevice = existingDevice;

                userDevice.updateDevice(
                        request.fcmToken(),
                        request.deviceType()
                );

            } else {

                // 다른 사용자가 같은 FCM Token을 사용 중인지 확인
                userDeviceRepository
                        .findByFcmToken(request.fcmToken())
                        .ifPresent(device -> {
                            throw new DeviceTokenConflictException();
                        });

                // 신규 기기 생성
                userDevice = userDeviceRepository.save(
                        new UserDevice(
                                userId,
                                request.fcmToken(),
                                request.deviceType(),
                                null
                        )
                );

                created = true;
            }
        }

        // 3. 응답 DTO 생성
        UserDeviceResponse response =
                new UserDeviceResponse(
                        String.valueOf(userDevice.getId()),
                        userDevice.getDeviceType(),

                        userDevice.getCreatedAt() == null
                                ? null
                                : userDevice.getCreatedAt()
                                .toInstant(ZoneOffset.UTC),

                        userDevice.getLastActiveAt() == null
                                ? null
                                : userDevice.getLastActiveAt()
                                .toInstant(ZoneOffset.UTC)
                );

        return new UserDeviceUpsertResult(
                created,
                response
        );
    }

    @Transactional
    public void deleteDevice(
            Long userId,
            Long deviceId
    ) {

        UserDevice userDevice =
                userDeviceRepository.findById(deviceId)
                        .filter(device ->
                                device.getUserId().equals(userId)
                        )
                        .orElseThrow(ResourceNotFoundException::new);

        userDeviceRepository.delete(userDevice);
    }
}