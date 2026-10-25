package com.travel.travelbackend.tripapi;

import com.travel.travelbackend.userapi.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Time;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static com.travel.travelbackend.tripapi.TripStore.*;

@Service
@Transactional
public class ItineraryService {
    private final PlanningSupport p;
    private final TripStore s;
    public ItineraryService(PlanningSupport p, TripStore s) { this.p = p; this.s = s; }

    private record Input(String title, LocalDate date, LocalTime start, LocalTime end, Long placeId, Long partyId, String note) {
        Object canonical() { return map("title",title,"date",date.toString(),"startTime",start.toString(),"endTime",end.toString(),"placeId",placeId==null?null:placeId.toString(),"partyId",partyId==null?null:partyId.toString(),"note",note); }
    }

    private static LocalDate date(Object value) {
        try {
            if (!(value instanceof String text) || !text.matches("\\d{4}-\\d{2}-\\d{2}")) throw ApiException.invalid();
            return LocalDate.parse(text);
        } catch (RuntimeException e) { throw fail(400,"INVALID_ITINERARY_DATE","일정 날짜를 확인해 주세요."); }
    }

    private static LocalTime time(Object value) {
        try {
            if (!(value instanceof String text) || !text.matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw ApiException.invalid();
            return LocalTime.parse(text);
        } catch (RuntimeException e) { throw fail(400,"INVALID_ITINERARY_TIME","일정 시간을 확인해 주세요."); }
    }

    private static Input input(Map<String,Object> body) {
        Inputs.fields(body,"title","date","startTime","endTime","placeId","partyId","note");
        String title = Inputs.string(body,"title",100,true);
        LocalDate date = date(body.get("date"));
        LocalTime start = time(body.get("startTime")), end = time(body.get("endTime"));
        if (end.isBefore(start)) throw fail(400,"INVALID_ITINERARY_TIME","종료 시간은 시작 시간 이후여야 해요.");
        return new Input(title,date,start,end,PlanningSupport.optionalId(body,"placeId"),PlanningSupport.optionalId(body,"partyId"),PlanningSupport.optionalText(body,"note",3000,false));
    }

    private Map<String,Object> itinerary(long tripId, long id) {
        var row = s.one("SELECT * FROM itinerary_item WHERE trip_id=? AND id=? FOR UPDATE",tripId,id);
        if (row == null) throw fail(404,"ITINERARY_NOT_FOUND","일정을 찾을 수 없어요.");
        return row;
    }

    private static String clock(Object value) {
        if (value == null) return "";
        LocalTime time = value instanceof Time sql ? sql.toLocalTime() : value instanceof LocalTime local ? local : LocalTime.parse(value.toString());
        return time.format(DateTimeFormatter.ofPattern("HH:mm"));
    }

    private Object view(Map<String,Object> row) {
        return map("id",str(row,"id"),"title",str(row,"title"),"date",str(row,"date"),"startTime",clock(row.get("start_time")),"endTime",clock(row.get("end_time")),
            "placeId",row.get("saved_place_id")==null?null:str(row,"saved_place_id"),"partyId",row.get("party_id")==null?null:str(row,"party_id"),"note",str(row,"note"),"placeName",str(row,"place_name"),"address",str(row,"address"));
    }

    private Map<String,Object> references(Map<String,Object> trip, Input input) {
        long tripId = n(trip,"id");
        if (input.date().isBefore(LocalDate.parse(str(trip,"start_date"))) || input.date().isAfter(LocalDate.parse(str(trip,"end_date"))))
            throw fail(400,"INVALID_ITINERARY_DATE","일정 날짜는 여행 기간 안이어야 해요.");
        if (input.partyId() != null && s.one("SELECT id FROM trip_party WHERE trip_id=? AND id=? FOR UPDATE",tripId,input.partyId()) == null)
            throw fail(404,"PARTY_NOT_FOUND","파티를 찾을 수 없어요.");
        if (input.placeId() == null) return null;
        var place = s.one("SELECT * FROM saved_place WHERE trip_id=? AND id=? FOR UPDATE",tripId,input.placeId());
        if (place == null) throw fail(404,"PLACE_NOT_FOUND","장소를 찾을 수 없어요.");
        return place;
    }

    public Object list(Jwt jwt, String tripId, String cursor, int limit) {
        var trip = p.access(jwt,tripId,false);
        return p.list("itinerary_item",n(trip,"id"),cursor,limit,this::view);
    }

    public Object get(Jwt jwt, String tripId, String itemId) {
        var trip = p.access(jwt,tripId,false);
        return view(itinerary(n(trip,"id"),Inputs.id(itemId)));
    }

    public Object create(Jwt jwt, String tripId, String rawKey, Map<String,Object> body) {
        Input input = input(body);
        String key = PlanningSupport.key(rawKey);
        var trip = p.access(jwt,tripId,false);
        long actor = s.actor(jwt);
        String digest = p.digest(n(trip,"id"),input.canonical());
        Object replay = p.replay(actor,"itinerary.create",key,digest);
        if (replay != null) return replay;
        p.trips.active(trip);
        var place = references(trip,input);
        long id = s.insert("INSERT INTO itinerary_item(trip_id,party_id,title,`date`,start_time,end_time,saved_place_id,place_name,address,note) VALUES(?,?,?,?,?,?,?,?,?,?)",
            n(trip,"id"),input.partyId(),input.title(),input.date(),input.start(),input.end(),input.placeId(),place==null?"":str(place,"name"),place==null?null:place.get("address"),input.note());
        Object response = view(itinerary(n(trip,"id"),id));
        p.remember(actor,"itinerary.create",key,digest,response);
        return response;
    }

    public Object update(Jwt jwt, String tripId, String itemId, Map<String,Object> body) {
        Input input = input(body);
        var trip = p.access(jwt,tripId,true);
        var row = itinerary(n(trip,"id"),Inputs.id(itemId));
        var place = references(trip,input);
        s.db.update("UPDATE itinerary_item SET party_id=?,title=?,`date`=?,start_time=?,end_time=?,saved_place_id=?,place_name=?,address=?,note=? WHERE id=?",
            input.partyId(),input.title(),input.date(),input.start(),input.end(),input.placeId(),place==null?"":str(place,"name"),place==null?null:place.get("address"),input.note(),n(row,"id"));
        return view(itinerary(n(trip,"id"),n(row,"id")));
    }

    public void delete(Jwt jwt, String tripId, String itemId) {
        var trip = p.access(jwt,tripId,true);
        var row = itinerary(n(trip,"id"),Inputs.id(itemId));
        s.db.update("DELETE FROM itinerary_item WHERE id=?",n(row,"id"));
    }
}
