package com.travel.travelbackend.service;

import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public User createUser(String name, String email) {
        User user = new User(name, email);

        return userRepository.save(user);
    }
}