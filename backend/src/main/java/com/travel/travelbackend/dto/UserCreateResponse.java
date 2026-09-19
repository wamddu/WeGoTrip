package com.travel.travelbackend.dto;

public record UserCreateResponse(
        Long id,
        String email,
        String name
) {
}