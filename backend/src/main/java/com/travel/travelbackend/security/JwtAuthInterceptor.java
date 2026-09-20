package com.travel.travelbackend.security;

import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.entity.UserDevice;
import com.travel.travelbackend.exception.AccountDeletedException;
import com.travel.travelbackend.exception.AccountInactiveException;
import com.travel.travelbackend.exception.InvalidTokenException;
import com.travel.travelbackend.exception.TokenExpiredException;
import com.travel.travelbackend.exception.TokenRevokedException;
import com.travel.travelbackend.exception.UnauthorizedException;
import com.travel.travelbackend.repository.UserDeviceRepository;
import com.travel.travelbackend.repository.UserRepository;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class JwtAuthInterceptor implements HandlerInterceptor {

    private final JwtProvider jwtProvider;
    private final UserDeviceRepository userDeviceRepository;
    private final UserRepository userRepository;

    public JwtAuthInterceptor(
            JwtProvider jwtProvider,
            UserDeviceRepository userDeviceRepository,
            UserRepository userRepository
    ) {
        this.jwtProvider = jwtProvider;
        this.userDeviceRepository = userDeviceRepository;
        this.userRepository = userRepository;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler
    ) {

        // 1. Authorization 헤더 확인
        String authorization = request.getHeader("Authorization");

        if (authorization == null) {
            throw new UnauthorizedException();
        }

        if (!authorization.startsWith("Bearer ")) {
            throw new InvalidTokenException();
        }

        String accessToken = authorization.substring(7);

        if (accessToken.isBlank()) {
            throw new InvalidTokenException();
        }

        // 2. JWT 검증
        Claims claims;

        try {
            claims = jwtProvider.parseToken(accessToken);

        } catch (ExpiredJwtException e) {
            throw new TokenExpiredException();

        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidTokenException();
        }

        // 3. Access Token인지 확인
        String tokenType = claims.get("tokenType", String.class);

        if (!"ACCESS".equals(tokenType)) {
            throw new InvalidTokenException();
        }

        // 4. userId 추출
        Long userId;

        try {
            userId = Long.valueOf(claims.getSubject());
        } catch (NumberFormatException e) {
            throw new InvalidTokenException();
        }

        // 5. sid(user_device.id) 추출
        Object sidValue = claims.get("sid");

        if (!(sidValue instanceof Number)) {
            throw new InvalidTokenException();
        }

        Long userDeviceId = ((Number) sidValue).longValue();

        // 6. 실제 로그인 세션 확인
        UserDevice userDevice =
                userDeviceRepository.findById(userDeviceId)
                        .orElseThrow(TokenRevokedException::new);

        // sid에 해당하는 세션이 실제 해당 사용자의 세션인지 확인
        if (!userDevice.getUserId().equals(userId)) {
            throw new InvalidTokenException();
        }

        // 7. 사용자 조회 및 현재 계정 상태 확인
        User user = userRepository.findById(userId)
                .orElseThrow(InvalidTokenException::new);

        if ("INACTIVE".equals(user.getStatus())) {
            throw new AccountInactiveException();
        }

        if ("DELETED".equals(user.getStatus())) {
            throw new AccountDeletedException();
        }

        // 8. 로그아웃 등으로 폐기된 세션인지 확인
        if (userDevice.getRefreshTokenHash() == null) {
            throw new TokenRevokedException();
        }

        // 9. Controller에서 사용할 정보 저장
        request.setAttribute("userId", userId);
        request.setAttribute("userDeviceId", userDeviceId);

        return true;
    }
}