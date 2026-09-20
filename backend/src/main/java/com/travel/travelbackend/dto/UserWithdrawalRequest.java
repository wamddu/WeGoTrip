package com.travel.travelbackend.dto;

import jakarta.validation.constraints.NotBlank;

public record UserWithdrawalRequest(

        @NotBlank(message = "현재 비밀번호는 필수입니다.")
        String currentPassword

) {
}