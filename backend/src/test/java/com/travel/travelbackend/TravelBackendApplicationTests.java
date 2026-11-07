package com.travel.travelbackend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:backend-context;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@org.springframework.test.context.ActiveProfiles("test")
class TravelBackendApplicationTests {

    @Test
    void contextLoads() {
    }

}
