package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.*;
import java.util.function.Function;
import static com.travel.travelbackend.tripapi.TripStore.*;

/** Shared helpers; callers own the transaction and always lock user, trip, then children. */
@Component
class PlanningSupport {
    final TripStore s;
    final TripService trips;
    private final ObjectMapper json;

    PlanningSupport(TripStore s, TripService trips, ObjectMapper json) {
        this.s = s; this.trips = trips; this.json = json;
    }

    Map<String,Object> access(Jwt jwt, String rawTripId, boolean write) {
        long actor = s.authenticate(jwt);
        var trip = trips.trip(Inputs.id(rawTripId));
        trips.access(trip, actor, false);
        if (write) trips.active(trip);
        return trip;
    }

    static String optionalText(Map<String,Object> body, String key, int max) {
        return optionalText(body,key,max,true);
    }

    static String optionalText(Map<String,Object> body, String key, int max, boolean trim) {
        Object value = body.get(key);
        if (value == null) return "";
        if (!(value instanceof String text)) throw ApiException.invalid();
        if (trim) text = text.strip();
        if (text.length() > max) throw ApiException.invalid();
        return text;
    }

    static Long optionalId(Map<String,Object> body, String key) {
        return body.get(key) == null ? null : Inputs.id(body.get(key));
    }

    static String key(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw ApiException.invalid();
        return value.toLowerCase(Locale.ROOT);
    }

    String digest(long tripId, Object input) {
        return hash(json.writeValueAsString(map("tripId", Long.toString(tripId), "input", input)));
    }

    Object replay(long actor, String operation, String key, String digest) {
        var saved = s.one("SELECT * FROM api_idempotency WHERE user_id=? AND operation=? AND request_key=? FOR UPDATE", actor, operation, key);
        if (saved == null) return null;
        if (!instant(saved,"expires_at").isAfter(s.clock.instant())) {
            s.db.update("DELETE FROM api_idempotency WHERE id=?", n(saved,"id"));
            return null;
        }
        if (!digest.equals(str(saved,"request_digest"))) throw fail(409,"IDEMPOTENCY_KEY_REUSED","다른 입력에는 새 생성 키를 사용해 주세요.");
        return json.readValue(str(saved,"response_body"), Object.class);
    }

    void remember(long actor, String operation, String key, String digest, Object response) {
        remember(actor,operation,key,digest,201,response);
    }

    void remember(long actor, String operation, String key, String digest, int status, Object response) {
        s.insert("INSERT INTO api_idempotency(user_id,operation,request_key,request_digest,response_status,response_body,expires_at) VALUES(?,?,?,?,?,?,?)",
            actor, operation, key, digest, status, json.writeValueAsString(response), Timestamp.from(s.clock.instant().plus(Duration.ofHours(24))));
    }

    Object list(String table, long tripId, String cursor, int limit, Function<Map<String,Object>,Object> view) {
        if (!Set.of("saved_place", "itinerary_item").contains(table)) throw new IllegalArgumentException("Unknown planning table");
        if (limit < 1 || limit > 100) throw ApiException.invalid();
        long after = 0;
        if (cursor != null) {
            try {
                String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
                if (!decoded.startsWith("id|")) throw ApiException.invalid();
                after = Inputs.id(decoded.substring(3));
            } catch (RuntimeException e) { throw ApiException.invalid(); }
        }
        var rows = s.db.queryForList("SELECT * FROM " + table + " WHERE trip_id=? AND id>? ORDER BY id ASC LIMIT ?", tripId, after, limit + 1);
        boolean more = rows.size() > limit;
        var selected = rows.subList(0, Math.min(limit, rows.size()));
        String next = more ? Base64.getUrlEncoder().withoutPadding().encodeToString(("id|" + n(selected.getLast(),"id")).getBytes(StandardCharsets.UTF_8)) : null;
        return map("items", selected.stream().map(view).toList(), "nextCursor", next);
    }
}
