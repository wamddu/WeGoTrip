package com.travel.travelbackend;

import com.travel.travelbackend.controller.MapsController;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MapsControllerTests {
    private final MapsController maps = new MapsController("");

    @Test
    void rejectsEmptyAndOversizedSearchBeforeCallingGoogle() {
        assertEquals(400, maps.search(" ").getStatusCode().value());
        assertEquals(400, maps.search("a".repeat(151)).getStatusCode().value());
    }

    @Test
    void reportsMissingConfigurationWithoutLeakingSecrets() {
        assertEquals(503, maps.search("부산 호텔").getStatusCode().value());
        assertEquals(503, maps.image(35, 129, 15, 350).getStatusCode().value());
    }

    @Test
    void rejectsInvalidMapInputsBeforeCallingGoogle() {
        assertEquals(400, maps.image(Double.NaN, 129, 15, 350).getStatusCode().value());
        assertEquals(400, maps.image(91, 129, 15, 350).getStatusCode().value());
        assertEquals(400, maps.image(35, 181, 15, 350).getStatusCode().value());
        assertEquals(400, maps.image(35, 129, 19, 350).getStatusCode().value());
        assertEquals(400, maps.image(35, 129, 15, 641).getStatusCode().value());
    }
}
