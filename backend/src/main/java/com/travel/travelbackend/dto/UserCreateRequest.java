package com.travel.travelbackend.dto;

public record UserCreateRequest(
        String name,
        String email
) {
}