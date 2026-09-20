package com.travel.travelbackend.dto;

public record UserCreateResponse(
        String id,
        String email,
        String name
) {
}