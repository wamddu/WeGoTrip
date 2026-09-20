package com.travel.travelbackend.dto;

public record ApiResponse<T>(
        String code,
        T data
) {
}