package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service
@Transactional
public class PartyService {
    private final TripStore s;
    private final TripService trips;
    private final ObjectMapper json;

    public PartyService(TripStore s, TripService trips, ObjectMapper json) {
        this.s = s; this.trips = trips; this.json = json;
    }

    private Map<String,Object> access(Jwt jwt, String tripId, boolean write) {
        long me = s.authenticate(jwt);
        var trip = trips.trip(Inputs.id(tripId));
        trips.access(trip, me, false);
        if (write) trips.active(trip);
        return trip;
    }

    private Map<String,Object> party(long tripId, long partyId) {
        var party = s.one("SELECT * FROM trip_party WHERE trip_id=? AND id=? FOR UPDATE", tripId, partyId);
        if (party == null) throw fail(404, "PARTY_NOT_FOUND", "파티를 찾을 수 없어요.");
        return party;
    }

    private Object view(Map<String,Object> party) {
        var members = s.db.queryForList("SELECT tm.user_id FROM trip_party_member pm JOIN trip_member tm ON tm.id=pm.trip_member_id WHERE pm.party_id=? AND tm.trip_id=? ORDER BY tm.user_id", n(party,"id"), n(party,"trip_id"));
        return map("id", str(party,"id"), "name", str(party,"name"),
            "memberIds", members.stream().map(m -> str(m,"user_id")).toList(),
            "createdAt", instant(party,"created_at"));
    }

    private List<Long> members(Map<String,Object> body, long tripId) {
        Object raw = body.get("memberIds");
        if (!(raw instanceof List<?> values) || values.isEmpty() || values.size() > 30) throw ApiException.invalid();
        var users = new TreeSet<Long>();
        for (var value : values) if (!users.add(Inputs.id(value))) throw ApiException.invalid();
        var result = new ArrayList<Long>();
        for (long user : users) {
            var member = s.one("SELECT tm.id FROM trip_member tm JOIN `user` u ON u.id=tm.user_id WHERE tm.trip_id=? AND tm.user_id=? AND u.status='ACTIVE'", tripId, user);
            if (member == null) throw fail(400, "PARTY_MEMBER_NOT_IN_TRIP", "여행에 참여 중인 멤버만 파티에 추가할 수 있어요.");
            result.add(n(member,"id"));
        }
        return result;
    }

    private void replaceMembers(long partyId, List<Long> memberIds) {
        s.db.update("DELETE FROM trip_party_member WHERE party_id=?", partyId);
        for (long id : memberIds) s.insert("INSERT INTO trip_party_member(party_id,trip_member_id) VALUES(?,?)", partyId, id);
    }

    public Object list(Jwt jwt, String tripId, String cursor, int limit) {
        var trip = access(jwt, tripId, false);
        var page = s.page(cursor, limit);
        return s.pageResult(s.rows("trip_party", "trip_id=?", List.of(n(trip,"id")), page, "created_at", true), page, "created_at", this::view);
    }

    public Object get(Jwt jwt, String tripId, String partyId) {
        var trip = access(jwt, tripId, false);
        return view(party(n(trip,"id"), Inputs.id(partyId)));
    }

    public Object create(Jwt jwt, String tripId, String key, Map<String,Object> body) {
        Inputs.fields(body, "name", "memberIds");
        if (key == null || !key.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw ApiException.invalid();
        key = key.toLowerCase(Locale.ROOT);
        var trip = access(jwt, tripId, true);
        String name = Inputs.name(body);
        var memberIds = members(body, n(trip,"id"));
        long me = s.actor(jwt);
        String digest = hash(json.writeValueAsString(List.of(tripId, name, memberIds)));
        var saved = s.one("SELECT * FROM api_idempotency WHERE user_id=? AND operation='party.create' AND request_key=? FOR UPDATE", me, key);
        if (saved != null && instant(saved,"expires_at").isAfter(s.clock.instant())) {
            if (!digest.equals(str(saved,"request_digest"))) throw fail(409,"IDEMPOTENCY_KEY_REUSED","다른 입력에는 새 생성 키를 사용해 주세요.");
            return json.readValue(str(saved,"response_body"), Object.class);
        }
        if (saved != null) s.db.update("DELETE FROM api_idempotency WHERE id=?", n(saved,"id"));
        long id = s.insert("INSERT INTO trip_party(trip_id,name,created_at) VALUES(?,?,?)", n(trip,"id"), name, s.now());
        replaceMembers(id, memberIds);
        Object result = view(party(n(trip,"id"), id));
        s.insert("INSERT INTO api_idempotency(user_id,operation,request_key,request_digest,response_status,response_body,expires_at) VALUES(?,'party.create',?,?,201,?,?)", me, key, digest, json.writeValueAsString(result), Timestamp.from(s.clock.instant().plus(Duration.ofHours(24))));
        return result;
    }

    public Object update(Jwt jwt, String tripId, String partyId, Map<String,Object> body) {
        Inputs.fields(body, "name", "memberIds");
        var trip = access(jwt, tripId, true);
        var party = party(n(trip,"id"), Inputs.id(partyId));
        String name = Inputs.name(body);
        var memberIds = members(body, n(trip,"id"));
        s.db.update("UPDATE trip_party SET name=? WHERE id=?", name, n(party,"id"));
        replaceMembers(n(party,"id"), memberIds);
        return view(party(n(trip,"id"), n(party,"id")));
    }

    public void delete(Jwt jwt, String tripId, String partyId) {
        var trip = access(jwt, tripId, true);
        var party = party(n(trip,"id"), Inputs.id(partyId));
        if (s.db.queryForObject("SELECT COUNT(*) FROM itinerary_item WHERE party_id=?", Long.class, n(party,"id")) > 0)
            throw fail(409,"PARTY_IN_USE","일정에 연결된 파티는 삭제할 수 없어요.");
        s.db.update("DELETE FROM trip_party_member WHERE party_id=?", n(party,"id"));
        s.db.update("DELETE FROM trip_party WHERE id=?", n(party,"id"));
    }
}
