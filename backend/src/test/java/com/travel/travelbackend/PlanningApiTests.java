package com.travel.travelbackend;

import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:planning-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000")
@AutoConfigureMockMvc @ActiveProfiles("test")
class PlanningApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    String a,b,c,trip,places,agenda;

    @BeforeEach void setup() throws Exception {
        for (String table : List.of("itinerary_item","saved_place","trip_party_member","trip_party","api_rate_limit","api_idempotency","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request")) db.update("DELETE FROM " + table);
        users.deleteAll();
        a = user("a"); b = user("b"); c = user("c");
        trip = newTrip();
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",Long.valueOf(trip),Long.valueOf(b));
        places = "/api/v1/trips/" + trip + "/saved-places";
        agenda = "/api/v1/trips/" + trip + "/itinerary-items";
    }

    String user(String name) { return users.saveAndFlush(new User(name,name+"@example.invalid",null,Instant.now())).getId().toString(); }
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request, String who) {
        return request.with(jwt().jwt(j -> j.subject(who).claim("tokenVersion",0).claim("auth_time",Instant.now().getEpochSecond())));
    }
    static Map<String,Object> map(Object... values) {
        var result = new LinkedHashMap<String,Object>();
        for (int i=0;i<values.length;i+=2) result.put((String) values[i],values[i+1]);
        return result;
    }
    String content(Object value) { return json.writeValueAsString(value); }
    <T> T field(ResultActions result, String path) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+path); }
    String newTrip() throws Exception {
        return field(create("/api/v1/trips",a,UUID.randomUUID().toString(),map("title","Busan","destination","Busan","startDate","2026-10-10","endDate","2026-10-12","budget",0,"inviteeIds",List.of())).andExpect(status().isCreated()),"trip.id");
    }
    Map<String,Object> placeBody(String name) {
        return map("name",name,"address","Busan Main St 1","category","카페","note"," 창가 자리 ","coordinates",map("latitude",35.123456789,"longitude",129.123456789));
    }
    Map<String,Object> itineraryBody(String placeId, String partyId) {
        return map("title","카페 방문","date","2026-10-11","startTime","10:00","endTime","11:00","placeId",placeId,"partyId",partyId,"note","같이 걷기");
    }
    ResultActions create(String path, String who, String key, Object body) throws Exception {
        return mvc.perform(auth(post(path),who).header("Idempotency-Key",key).contentType("application/json").content(content(body)));
    }
    ResultActions update(String path, String who, Object body) throws Exception {
        return mvc.perform(auth(put(path),who).contentType("application/json").content(content(body)));
    }
    String place() throws Exception { return field(create(places,a,UUID.randomUUID().toString(),placeBody("Cafe")).andExpect(status().isCreated()),"id"); }
    String item(String placeId, String partyId) throws Exception { return field(create(agenda,a,UUID.randomUUID().toString(),itineraryBody(placeId,partyId)).andExpect(status().isCreated()),"id"); }
    String party(String tripId) throws Exception {
        return field(create("/api/v1/trips/"+tripId+"/parties",a,UUID.randomUUID().toString(),map("name","Cafe team","memberIds",List.of(a))).andExpect(status().isCreated()),"id");
    }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }

    @Test void sharedCrudPersistsCoordinatesNotesAndPlaceSnapshots() throws Exception {
        String place = place(), party = party(trip), item = item(place,party);
        mvc.perform(auth(get(places+"/"+place),b)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.data.note").value(" 창가 자리 ")).andExpect(jsonPath("$.data.coordinates.latitude").value(35.1234568));
        mvc.perform(auth(get(agenda+"/"+item),b)).andExpect(jsonPath("$.data.placeId").value(place)).andExpect(jsonPath("$.data.partyId").value(party))
            .andExpect(jsonPath("$.data.placeName").value("Cafe")).andExpect(jsonPath("$.data.startTime").value("10:00"));
        var changedPlace = placeBody("Beach Cafe"); changedPlace.put("address","Beach St 2"); changedPlace.put("coordinates",null);
        update(places+"/"+place,b,changedPlace).andExpect(status().isOk()).andExpect(jsonPath("$.data.coordinates").isEmpty());
        mvc.perform(auth(get(agenda+"/"+item),a)).andExpect(jsonPath("$.data.placeName").value("Beach Cafe")).andExpect(jsonPath("$.data.address").value("Beach St 2"));
        assertEquals("Beach Cafe",db.queryForObject("SELECT place_name FROM itinerary_item WHERE id=?",String.class,item));
        mvc.perform(auth(delete(places+"/"+place),b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PLACE_IN_USE"));
        mvc.perform(auth(delete("/api/v1/trips/"+trip+"/parties/"+party),b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARTY_IN_USE"));
        update(agenda+"/"+item,b,itineraryBody(null,null)).andExpect(status().isOk()).andExpect(jsonPath("$.data.placeId").isEmpty())
            .andExpect(jsonPath("$.data.partyId").isEmpty()).andExpect(jsonPath("$.data.placeName").value("")).andExpect(jsonPath("$.data.address").value(""));
        mvc.perform(auth(delete(places+"/"+place),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(auth(delete("/api/v1/trips/"+trip+"/parties/"+party),a)).andExpect(status().isOk());
        mvc.perform(auth(delete(agenda+"/"+item),b)).andExpect(status().isOk());
        assertEquals(0,count("saved_place")); assertEquals(0,count("itinerary_item"));
    }

    @Test void outsidersCrossTripIdsAndReferencesAreRejected() throws Exception {
        String place = place(), item = item(place,null), otherTrip = newTrip(), otherParty = party(otherTrip);
        String otherPlaces = "/api/v1/trips/"+otherTrip+"/saved-places";
        String otherPlace = field(create(otherPlaces,a,UUID.randomUUID().toString(),placeBody("Other")).andExpect(status().isCreated()),"id");
        for (String path : List.of(places,agenda)) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(auth(get(path),c)).andExpect(status().isNotFound());
        }
        create(places,c,UUID.randomUUID().toString(),placeBody("No")).andExpect(status().isNotFound());
        create(agenda,c,UUID.randomUUID().toString(),itineraryBody(null,null)).andExpect(status().isNotFound());
        for (String path : List.of(places+"/"+place,agenda+"/"+item)) {
            mvc.perform(auth(get(path),c)).andExpect(status().isNotFound());
            mvc.perform(auth(delete(path),c)).andExpect(status().isNotFound());
        }
        update(places+"/"+place,c,placeBody("No")).andExpect(status().isNotFound());
        update(agenda+"/"+item,c,itineraryBody(null,null)).andExpect(status().isNotFound());
        mvc.perform(auth(get(otherPlaces+"/"+place),a)).andExpect(status().isNotFound());
        mvc.perform(auth(delete("/api/v1/trips/"+otherTrip+"/itinerary-items/"+item),a)).andExpect(status().isNotFound());
        create(agenda,a,UUID.randomUUID().toString(),itineraryBody(otherPlace,null)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PLACE_NOT_FOUND"));
        update(agenda+"/"+item,a,itineraryBody(place,otherParty)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PARTY_NOT_FOUND"));
        assertEquals(1,count("itinerary_item"));
        mvc.perform(auth(get(agenda+"/"+item),a)).andExpect(jsonPath("$.data.placeId").value(place));
    }

    @Test void archivedTripsAllowReadsAndBlockNewWrites() throws Exception {
        String place = place(), item = item(place,null);
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        for (String path : List.of(places,agenda,places+"/"+place,agenda+"/"+item)) mvc.perform(auth(get(path),b)).andExpect(status().isOk());
        create(places,b,UUID.randomUUID().toString(),placeBody("No")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRIP_ARCHIVED"));
        create(agenda,b,UUID.randomUUID().toString(),itineraryBody(null,null)).andExpect(status().isConflict());
        update(places+"/"+place,b,placeBody("No")).andExpect(status().isConflict());
        update(agenda+"/"+item,b,itineraryBody(null,null)).andExpect(status().isConflict());
        for (String path : List.of(places+"/"+place,agenda+"/"+item)) mvc.perform(auth(delete(path),a)).andExpect(status().isConflict());
    }

    @Test void scalarAndReferenceValidationNeverPartiallyModifiesRecords() throws Exception {
        String place = place(), item = item(place,null);
        var invalidPlaces = new ArrayList<Map<String,Object>>();
        for (var entry : map("name"," ","address","x".repeat(256),"category","x".repeat(51),"note","x".repeat(3001)).entrySet()) {
            var input = placeBody("Cafe"); input.put(entry.getKey(),entry.getValue()); invalidPlaces.add(input);
        }
        var tooLong = placeBody("x".repeat(101)); invalidPlaces.add(tooLong);
        for (Object coordinates : List.of(map("latitude",91,"longitude",129),map("latitude",35,"longitude",181),map("latitude",35),map("latitude",null,"longitude",129))) {
            var input = placeBody("Cafe"); input.put("coordinates",coordinates); invalidPlaces.add(input);
        }
        for (var input : invalidPlaces) {
            create(places,a,UUID.randomUUID().toString(),input).andExpect(status().isBadRequest());
            update(places+"/"+place,a,input).andExpect(status().isBadRequest());
        }
        for (var entry : map("date","2026-02-30","startTime","24:00","endTime","09:00","title","x".repeat(101),"note","x".repeat(3001)).entrySet()) {
            var input = itineraryBody(place,null); input.put(entry.getKey(),entry.getValue());
            create(agenda,a,UUID.randomUUID().toString(),input).andExpect(status().isBadRequest());
            update(agenda+"/"+item,a,input).andExpect(status().isBadRequest());
        }
        for (String date : List.of("2026-10-09","2026-10-13","2026-10-1")) {
            var input = itineraryBody(null,null); input.put("date",date);
            create(agenda,a,UUID.randomUUID().toString(),input).andExpect(status().isBadRequest());
        }
        var invalidFields = itineraryBody(null,null); invalidFields.put("placeName","Untrusted");
        create(agenda,a,UUID.randomUUID().toString(),invalidFields).andExpect(status().isBadRequest());
        mvc.perform(auth(post(places),a).contentType("application/json").content(content(placeBody("No")))).andExpect(status().isBadRequest());
        assertEquals(1,count("saved_place")); assertEquals(1,count("itinerary_item"));
        mvc.perform(auth(get(places+"/"+place),a)).andExpect(jsonPath("$.data.name").value("Cafe"));
        mvc.perform(auth(get(agenda+"/"+item),a)).andExpect(jsonPath("$.data.title").value("카페 방문"));
        var boundary = placeBody("x".repeat(100)); boundary.put("address","x".repeat(255)); boundary.put("category","x".repeat(50)); boundary.put("note","x".repeat(3000));
        create(places,a,UUID.randomUUID().toString(),boundary).andExpect(status().isCreated());
        var sameTime = itineraryBody(null,null); sameTime.put("endTime","10:00");
        create(agenda,a,UUID.randomUUID().toString(),sameTime).andExpect(status().isCreated());
    }

    @Test void legacyNullFieldsReadWithoutInventedTimesOrLocations() throws Exception {
        db.update("INSERT INTO saved_place(trip_id,name) VALUES(?,'Legacy')",trip);
        db.update("INSERT INTO itinerary_item(trip_id,title,`date`,place_name,address) VALUES(?,'Legacy schedule','2026-10-11','Old cafe','Old address')",trip);
        mvc.perform(auth(get(places),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].coordinates").isEmpty())
            .andExpect(jsonPath("$.data.items[0].address").value("")).andExpect(jsonPath("$.data.items[0].note").value(""));
        mvc.perform(auth(get(agenda),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].startTime").value(""))
            .andExpect(jsonPath("$.data.items[0].endTime").value("")).andExpect(jsonPath("$.data.items[0].placeId").isEmpty())
            .andExpect(jsonPath("$.data.items[0].placeName").value("Old cafe"));
    }

    @Test void directPlaceDeletionDetachesTheForeignKeyAndPreservesTheScheduleSnapshot() throws Exception {
        String place = place(), item = item(place,null);
        mvc.perform(auth(delete(places+"/"+place),a)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PLACE_IN_USE"));
        // Exercise the approved FK action directly in the isolated H2 fixture.
        db.update("DELETE FROM saved_place WHERE id=?",place);
        assertEquals(0,count("saved_place"));
        assertEquals(1,count("itinerary_item"));
        assertNull(db.queryForObject("SELECT saved_place_id FROM itinerary_item WHERE id=?",Long.class,item));
        assertEquals("Cafe",db.queryForObject("SELECT place_name FROM itinerary_item WHERE id=?",String.class,item));
        assertEquals("Busan Main St 1",db.queryForObject("SELECT address FROM itinerary_item WHERE id=?",String.class,item));
        mvc.perform(auth(get(agenda+"/"+item),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data.placeId").isEmpty())
            .andExpect(jsonPath("$.data.placeName").value("Cafe")).andExpect(jsonPath("$.data.address").value("Busan Main St 1"))
            .andExpect(jsonPath("$.data.note").value("같이 걷기"));
    }

    @Test void tripDeletionCascadesBothChildrenWhileAScheduleReferencesAPlace() throws Exception {
        String place = place(), party = party(trip), item = item(place,party);
        assertEquals(place,db.queryForObject("SELECT saved_place_id FROM itinerary_item WHERE id=?",String.class,item));
        db.update("DELETE FROM trip WHERE id=?",trip);
        assertEquals(0,count("trip"));
        assertEquals(0,count("saved_place"));
        assertEquals(0,count("itinerary_item"));
        assertEquals(0,count("trip_party"));
        assertEquals(0,count("trip_party_member"));
    }

    @Test void retriesUseRequestIdentityBeforeMutableReferenceValidation() throws Exception {
        String placeKey = UUID.randomUUID().toString();
        String place = field(create(places,a,placeKey,placeBody("Cafe")).andExpect(status().isCreated()),"id");
        String party = party(trip), key = UUID.randomUUID().toString();
        var input = itineraryBody(place,party);
        String item = field(create(agenda,a,key,input).andExpect(status().isCreated()),"id");
        update(places+"/"+place,b,placeBody("Changed")).andExpect(status().isOk());
        create(agenda,a,key,input).andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(item)).andExpect(jsonPath("$.data.placeName").value("Cafe"));
        update(agenda+"/"+item,b,itineraryBody(null,null)).andExpect(status().isOk());
        mvc.perform(auth(delete(places+"/"+place),b)).andExpect(status().isOk());
        mvc.perform(auth(delete("/api/v1/trips/"+trip+"/parties/"+party),b)).andExpect(status().isOk());
        create(agenda,a,key,input).andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(item));
        create(places,a,placeKey,placeBody("Cafe")).andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(place));
        var changed = itineraryBody(null,null);
        create(agenda,a,key,changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        String otherTrip = newTrip();
        create("/api/v1/trips/"+otherTrip+"/itinerary-items",a,key,input).andExpect(status().isConflict());
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        create(agenda,a,key,input).andExpect(status().isCreated());
        db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,a);
        create(agenda,a,key,input).andExpect(status().isNotFound());
        assertEquals(1,count("itinerary_item")); assertEquals(0,count("saved_place"));
    }

    @Test void idCursorPagesHaveNoDuplicatesAndRejectInvalidBounds() throws Exception {
        String firstPlace = place(), secondPlace = place(), firstItem = item(null,null), secondItem = item(null,null);
        for (var test : List.of(List.of(places,firstPlace,secondPlace),List.of(agenda,firstItem,secondItem))) {
            var first = mvc.perform(auth(get(test.get(0)).param("limit","1"),b)).andExpect(status().isOk());
            assertEquals(test.get(1),field(first,"items[0].id"));
            String cursor = field(first,"nextCursor");
            mvc.perform(auth(get(test.get(0)).param("limit","1").param("cursor",cursor),b)).andExpect(jsonPath("$.data.items[0].id").value(test.get(2))).andExpect(jsonPath("$.data.nextCursor").isEmpty());
            mvc.perform(auth(get(test.get(0)).param("cursor","invalid"),a)).andExpect(status().isBadRequest());
            for (String limit : List.of("0","101")) mvc.perform(auth(get(test.get(0)).param("limit",limit),a)).andExpect(status().isBadRequest());
        }
    }

    @Test void shrinkingTravelDatesCannotExcludeStoredItineraries() throws Exception {
        var input = itineraryBody(null,null); input.put("date","2026-10-12");
        create(agenda,b,UUID.randomUUID().toString(),input).andExpect(status().isCreated());
        mvc.perform(auth(patch("/api/v1/trips/"+trip),a).contentType("application/json").content(content(map("endDate","2026-10-11","version",0))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ITINERARY_OUTSIDE_TRIP_DATES"));
        assertEquals(0L,db.queryForObject("SELECT version FROM trip WHERE id=?",Long.class,trip));
        mvc.perform(auth(patch("/api/v1/trips/"+trip),a).contentType("application/json").content(content(map("endDate","2026-10-13","version",0))))
            .andExpect(status().isOk());
    }

    @Test void failedIdempotencyWriteRollsBackTheCreatedPlace() throws Exception {
        String key = UUID.randomUUID().toString();
        db.execute("ALTER TABLE api_idempotency ADD CONSTRAINT planning_failpoint CHECK(operation <> 'place.create')");
        try {
            create(places,a,key,placeBody("Cafe")).andExpect(status().isConflict());
            assertEquals(0,count("saved_place"));
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM api_idempotency WHERE operation='place.create'",Integer.class));
        } finally { db.execute("ALTER TABLE api_idempotency DROP CONSTRAINT planning_failpoint"); }
        create(places,a,key,placeBody("Cafe")).andExpect(status().isCreated());
        assertEquals(1,count("saved_place"));
    }

    record Response(int status, String body) {}
    Response response(MockHttpServletRequestBuilder request) throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        return new Response(response.getStatus(),response.getContentAsString());
    }
    List<Response> race(Callable<Response> first, Callable<Response> second) throws Exception {
        var ready = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { ready.await(); return first.call(); });
            var b = executor.submit(() -> { ready.await(); return second.call(); });
            return List.of(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
        }
    }

    @Test void concurrentDuplicateCreatesPersistOneResponse() throws Exception {
        String key = UUID.randomUUID().toString();
        var responses = race(
            () -> response(auth(post(places),a).header("Idempotency-Key",key).contentType("application/json").content(content(placeBody("Cafe")))),
            () -> response(auth(post(places),a).header("Idempotency-Key",key).contentType("application/json").content(content(placeBody("Cafe")))));
        assertEquals(List.of(201,201),responses.stream().map(Response::status).toList(),responses.toString());
        assertEquals(JsonPath.<String>read(responses.getFirst().body(),"$.data.id"),JsonPath.<String>read(responses.getLast().body(),"$.data.id"));
        assertEquals(1,count("saved_place"));
    }

    @Test void placeDeletionAndItineraryCreationSerializeWithoutDanglingReferences() throws Exception {
        String place = place();
        var responses = race(
            () -> response(auth(delete(places+"/"+place),a)),
            () -> response(auth(post(agenda),b).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(content(itineraryBody(place,null)))));
        assertTrue((responses.getFirst().status()==200 && responses.getLast().status()==404) || (responses.getFirst().status()==409 && responses.getLast().status()==201),responses.toString());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM itinerary_item i LEFT JOIN saved_place p ON p.id=i.saved_place_id WHERE i.saved_place_id IS NOT NULL AND p.id IS NULL",Integer.class));
    }

    @Test void partyDeletionAndItineraryCreationSerializeWithoutSilentlyDetaching() throws Exception {
        String party = party(trip);
        var responses = race(
            () -> response(auth(delete("/api/v1/trips/"+trip+"/parties/"+party),a)),
            () -> response(auth(post(agenda),b).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(content(itineraryBody(null,party)))));
        assertTrue((responses.getFirst().status()==200 && responses.getLast().status()==404) || (responses.getFirst().status()==409 && responses.getLast().status()==201),responses.toString());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM itinerary_item WHERE party_id IS NULL",Integer.class));
    }

    @Test void periodChangeAndRegistrationKeepEveryScheduleInRange() throws Exception {
        var input = itineraryBody(null,null); input.put("date","2026-10-12");
        var responses = race(
            () -> response(auth(patch("/api/v1/trips/"+trip),a).contentType("application/json").content(content(map("endDate","2026-10-11","version",0)))),
            () -> response(auth(post(agenda),b).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(content(input))));
        assertTrue((responses.getFirst().status()==200 && responses.getLast().status()==400) || (responses.getFirst().status()==409 && responses.getLast().status()==201),responses.toString());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM itinerary_item i JOIN trip t ON t.id=i.trip_id WHERE i.`date`<t.start_date OR i.`date`>t.end_date",Integer.class));
    }

    @Test void archivalAndCreationSerializeAndBlockSubsequentWrites() throws Exception {
        var responses = race(
            () -> response(auth(patch("/api/v1/trips/"+trip),a).contentType("application/json").content(content(map("status","ARCHIVED","version",0)))),
            () -> response(auth(post(agenda),b).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(content(itineraryBody(null,null)))));
        assertEquals(200,responses.getFirst().status(),responses.toString());
        assertTrue(Set.of(201,409).contains(responses.getLast().status()),responses.toString());
        create(agenda,b,UUID.randomUUID().toString(),itineraryBody(null,null)).andExpect(status().isConflict());
    }

    @Test void withdrawalAndCreationSerializeWhilePreservingSharedData() throws Exception {
        var responses = race(
            () -> response(auth(delete("/api/v1/users/me"),b)),
            () -> response(auth(post(agenda),b).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(content(itineraryBody(null,null)))));
        assertEquals(200,responses.getFirst().status(),responses.toString());
        assertTrue(Set.of(201,403).contains(responses.getLast().status()),responses.toString());
        assertFalse(users.existsById(Long.valueOf(b)));
        assertEquals(responses.getLast().status()==201?1:0,count("itinerary_item"));
        mvc.perform(auth(get(agenda),a)).andExpect(status().isOk());
        mvc.perform(auth(get(places),b)).andExpect(status().isForbidden());
    }

    @Test void revokedTokenVersionsCannotReadOrWritePlanningData() throws Exception {
        db.update("UPDATE `user` SET token_version=token_version+1 WHERE id=?",a);
        mvc.perform(auth(get(places),a)).andExpect(status().isUnauthorized());
        mvc.perform(auth(get(agenda),a)).andExpect(status().isUnauthorized());
        create(places,a,UUID.randomUUID().toString(),placeBody("No")).andExpect(status().isUnauthorized());
        create(agenda,a,UUID.randomUUID().toString(),itineraryBody(null,null)).andExpect(status().isUnauthorized());
    }
}
