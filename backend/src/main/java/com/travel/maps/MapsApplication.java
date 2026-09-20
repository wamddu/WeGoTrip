package com.travel.maps;

import com.travel.travelbackend.controller.MapsController;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** Local maps proxy can run alongside the frontend's mock data without MySQL. */
@Configuration
@EnableAutoConfiguration(excludeName = {
    "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
    "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
    "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration"
})
@Import({MapsController.class, com.travel.travelbackend.userapi.UserSecurity.class})
public class MapsApplication {
    public static void main(String[] args) {
        SpringApplication.run(MapsApplication.class, args);
    }
}
