package com.travel.travelbackend.service;

import com.travel.travelbackend.dto.UserConsentResponse;
import com.travel.travelbackend.repository.UserConsentRepository;
import org.springframework.stereotype.Service;
import java.time.ZoneOffset;

import java.util.List;

@Service
public class UserConsentService {

    private final UserConsentRepository userConsentRepository;

    public UserConsentService(
            UserConsentRepository userConsentRepository
    ) {
        this.userConsentRepository = userConsentRepository;
    }

    public List<UserConsentResponse> getConsents(Long userId) {

        return userConsentRepository
                .findAllByUserIdOrderByAgreedAtDescIdDesc(userId)
                .stream()
                .map(consent ->
                        new UserConsentResponse(
                                String.valueOf(consent.getId()),
                                consent.getConsentType(),
                                consent.getVersion(),
                                consent.getAgreedAt().toInstant(ZoneOffset.UTC)
                        )
                )
                .toList(); // 동의 기록이 없으면 [] 반환
    }
}