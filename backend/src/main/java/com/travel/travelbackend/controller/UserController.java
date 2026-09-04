package com.travel.travelbackend.controller;

import com.travel.travelbackend.dto.UserCreateRequest;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.service.UserService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    public User createUser(@RequestBody UserCreateRequest request) {

        return userService.createUser(
                request.name(),
                request.email()
        );
    }
}