package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.*;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service
@Transactional
public class PlaceService {
    private final PlanningSupport p;
    private final TripStore s;
    public PlaceService(PlanningSupport p, TripStore s) { this.p = p; this.s = s; }

    private record Input(String name, String address, String category, String note, BigDecimal latitude, BigDecimal longitude) {
        Object canonical() { return map("name", name, "address", address, "category", category, "note", note, "latitude", latitude, "longitude", longitude); }
    }

    private static BigDecimal coordinate(Object value, int bound) {
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue()) || Math.abs(number.doubleValue()) > bound) throw ApiException.invalid();
        return new BigDecimal(number.toString()).setScale(7, RoundingMode.HALF_UP);
    }

    private static Input input(Map<String,Object> body) {
        Inputs.fields(body, "name", "address", "category", "note", "coordinates");
        String name = Inputs.string(body,"name",100,true), address = Inputs.string(body,"address",255,true);
        String category = PlanningSupport.optionalText(body,"category",50), note = PlanningSupport.optionalText(body,"note",3000,false);
        BigDecimal latitude = null, longitude = null;
        if (body.get("coordinates") != null) {
            if (!(body.get("coordinates") instanceof Map<?,?> coordinates) || !coordinates.keySet().equals(Set.of("latitude","longitude"))) throw ApiException.invalid();
            latitude = coordinate(coordinates.get("latitude"),90);
            longitude = coordinate(coordinates.get("longitude"),180);
        }
        return new Input(name,address,category,note,latitude,longitude);
    }

    private Map<String,Object> place(long tripId, long id) {
        var row = s.one("SELECT * FROM saved_place WHERE trip_id=? AND id=? FOR UPDATE", tripId, id);
        if (row == null) throw fail(404,"PLACE_NOT_FOUND","장소를 찾을 수 없어요.");
        return row;
    }

    private Object view(Map<String,Object> row) {
        Object coordinates = row.get("latitude") == null || row.get("longitude") == null ? null : map("latitude",row.get("latitude"),"longitude",row.get("longitude"));
        return map("id",str(row,"id"),"name",str(row,"name"),"address",str(row,"address"),"category",str(row,"category"),"note",str(row,"note"),"coordinates",coordinates);
    }

    public Object list(Jwt jwt, String tripId, String cursor, int limit) {
        var trip = p.access(jwt,tripId,false);
        return p.list("saved_place",n(trip,"id"),cursor,limit,this::view);
    }

    public Object get(Jwt jwt, String tripId, String placeId) {
        var trip = p.access(jwt,tripId,false);
        return view(place(n(trip,"id"),Inputs.id(placeId)));
    }

    public Object create(Jwt jwt, String tripId, String rawKey, Map<String,Object> body) {
        Input input = input(body);
        String key = PlanningSupport.key(rawKey);
        var trip = p.access(jwt,tripId,false);
        long actor = s.actor(jwt);
        String digest = p.digest(n(trip,"id"),input.canonical());
        Object replay = p.replay(actor,"place.create",key,digest);
        if (replay != null) return replay;
        p.trips.active(trip);
        long id = s.insert("INSERT INTO saved_place(trip_id,name,address,category,note,latitude,longitude) VALUES(?,?,?,?,?,?,?)",
            n(trip,"id"),input.name(),input.address(),input.category().isEmpty()?null:input.category(),input.note(),input.latitude(),input.longitude());
        Object response = view(place(n(trip,"id"),id));
        p.remember(actor,"place.create",key,digest,response);
        return response;
    }

    public Object update(Jwt jwt, String tripId, String placeId, Map<String,Object> body) {
        Input input = input(body);
        var trip = p.access(jwt,tripId,true);
        var row = place(n(trip,"id"),Inputs.id(placeId));
        long id = n(row,"id");
        s.db.update("UPDATE saved_place SET name=?,address=?,category=?,note=?,latitude=?,longitude=? WHERE id=?",
            input.name(),input.address(),input.category().isEmpty()?null:input.category(),input.note(),input.latitude(),input.longitude(),id);
        // Keep the fallback snapshot in sync while the trip lock excludes itinerary writers.
        s.db.update("UPDATE itinerary_item SET place_name=?,address=? WHERE trip_id=? AND saved_place_id=?",input.name(),input.address(),n(trip,"id"),id);
        return view(place(n(trip,"id"),id));
    }

    public void delete(Jwt jwt, String tripId, String placeId) {
        var trip = p.access(jwt,tripId,true);
        var row = place(n(trip,"id"),Inputs.id(placeId));
        long id = n(row,"id");
        if (s.db.queryForObject("SELECT COUNT(*) FROM itinerary_item WHERE saved_place_id=?",Long.class,id) > 0)
            throw fail(409,"PLACE_IN_USE","일정에 연결된 장소는 삭제할 수 없어요.");
        s.db.update("DELETE FROM saved_place WHERE id=?",id);
    }
}
