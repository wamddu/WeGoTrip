package com.travel.travelbackend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(

        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.")
        String email,

        @Size(min = 1, max = 50, message = "이름은 1자 이상 50자 이하여야 합니다.")
        String name,

        String bankAccountNumber

) {
    public UserUpdateRequest {
        if (name != null) {
            name = name.trim();
        }
    }
}