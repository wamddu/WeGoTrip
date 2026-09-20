package com.travel.travelbackend.config;

import com.travel.travelbackend.security.JwtAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final JwtAuthInterceptor jwtAuthInterceptor;

    public WebConfig(JwtAuthInterceptor jwtAuthInterceptor) {
        this.jwtAuthInterceptor = jwtAuthInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {

        registry.addInterceptor(jwtAuthInterceptor)

                // 앞으로 인증이 필요한 API
                .addPathPatterns("/api/v1/**")

                // 인증 없이 접근 가능한 API
                .excludePathPatterns(
                        "/api/v1/users",
                        "/api/v1/auth/login",
                        "/api/v1/auth/tokens/refresh"
                );
    }
}