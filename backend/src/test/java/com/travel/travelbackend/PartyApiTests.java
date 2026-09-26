package com.travel.travelbackend;

import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:party-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.sql.init.schema-locations=classpath:trip-schema.sql,classpath:party-schema.sql"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class PartyApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    String a,b,c,trip,path;

    @BeforeEach void setup() throws Exception {
        for (String table: List.of("itinerary_item","trip_party_member","trip_party","api_idempotency","trip_member","trip")) db.update("DELETE FROM "+table);
        users.deleteAll();
        a=user("a"); b=user("b"); c=user("c");
        trip=field(mvc.perform(auth(post("/api/v1/trips"),a).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json")
            .content("{\"title\":\"Busan\",\"destination\":\"Busan\",\"startDate\":\"2026-10-10\",\"endDate\":\"2026-10-12\",\"budget\":0,\"inviteeIds\":[]}")).andExpect(status().isCreated()),"trip.id");
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",Long.valueOf(trip),Long.valueOf(b));
        path="/api/v1/trips/"+trip+"/parties";
    }
    String user(String name) { return users.saveAndFlush(new User(name,name+"@example.invalid",null,Instant.now())).getId().toString(); }
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request,String who) { return request.with(jwt().jwt(j->j.subject(who).claim("tokenVersion",0))); }
    String field(ResultActions result,String field) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+field); }
    String body(String name,String... ids) { return "{\"name\":\""+name+"\",\"memberIds\":["+String.join(",",Arrays.stream(ids).map(id->"\""+id+"\"").toList())+"]}"; }
    ResultActions create(String who,String key,String body) throws Exception { return mvc.perform(auth(post(path),who).header("Idempotency-Key",key).contentType("application/json").content(body)); }
    String party() throws Exception { return field(create(a,UUID.randomUUID().toString(),body("Cafe",a,b)).andExpect(status().isCreated()),"id"); }

    @Test void sharedCrudUsesTripMembershipIds() throws Exception {
        String id=party();
        mvc.perform(auth(get(path),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].memberIds.length()").value(2));
        mvc.perform(auth(put(path+"/"+id),b).contentType("application/json").content(body("Beach",b))).andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("Beach"));
        assertEquals(1, db.queryForObject("SELECT COUNT(*) FROM trip_party_member pm JOIN trip_member tm ON tm.id=pm.trip_member_id WHERE tm.user_id=? AND tm.trip_id=?",Integer.class,Long.valueOf(b),Long.valueOf(trip)));
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.memberIds[0]").value(b));
        mvc.perform(auth(delete(path+"/"+id),a)).andExpect(status().isOk());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM trip_party_member",Integer.class));
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(status().isNotFound());
    }

    @Test void outsidersAndCrossTripPartyIdsAreRejected() throws Exception {
        String id=party();
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(auth(get(path),c)).andExpect(status().isNotFound());
        create(c,UUID.randomUUID().toString(),body("No",c)).andExpect(status().isNotFound());
        mvc.perform(auth(put(path+"/"+id),c).contentType("application/json").content(body("No",c))).andExpect(status().isNotFound());
        mvc.perform(auth(delete(path+"/"+id),c)).andExpect(status().isNotFound());
        db.update("INSERT INTO trip(id,name,destination,start_date,end_date,owner_id,created_at,updated_at) VALUES(99999,'Other','Other','2026-10-10','2026-10-12',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",Long.valueOf(a));
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(99999,?,CURRENT_TIMESTAMP)",Long.valueOf(a));
        mvc.perform(auth(get("/api/v1/trips/99999/parties/"+id),a)).andExpect(status().isNotFound());
        mvc.perform(auth(delete("/api/v1/trips/99999/parties/"+id),a)).andExpect(status().isNotFound());
    }

    @Test void invalidMembersAndNamesDoNotPartiallyModifyAParty() throws Exception {
        String id=party();
        for(String input: List.of(body("No",c),body("No",a,a),body("No"),body(" ",a),body("x".repeat(51),a))) {
            create(a,UUID.randomUUID().toString(),input).andExpect(status().isBadRequest());
            mvc.perform(auth(put(path+"/"+id),a).contentType("application/json").content(input)).andExpect(status().isBadRequest());
        }
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.name").value("Cafe")).andExpect(jsonPath("$.data.memberIds.length()").value(2));
    }

    @Test void archiveIsReadOnlyAndLinkedSchedulesPreventDeletion() throws Exception {
        String id=party();
        db.update("INSERT INTO itinerary_item(trip_id,party_id,title,`date`,place_name) VALUES(?,?,'Lunch','2026-10-10','Cafe')",Long.valueOf(trip),Long.valueOf(id));
        mvc.perform(auth(delete(path+"/"+id),a)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARTY_IN_USE"));
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",Long.valueOf(trip));
        mvc.perform(auth(get(path),a)).andExpect(status().isOk());
        create(a,UUID.randomUUID().toString(),body("No",a)).andExpect(status().isConflict());
        mvc.perform(auth(put(path+"/"+id),a).contentType("application/json").content(body("No",a))).andExpect(status().isConflict());
        mvc.perform(auth(delete(path+"/"+id),a)).andExpect(status().isConflict());
    }

    @Test void retriesAreIdempotentAndPaginationHasNoDuplicates() throws Exception {
        String key=UUID.randomUUID().toString();
        String id=field(create(a,key,body("Cafe",a,b)).andExpect(status().isCreated()),"id");
        assertEquals(id,field(create(a,key,body("Cafe",b,a)).andExpect(status().isCreated()),"id"));
        create(a,key,body("Changed",a)).andExpect(status().isConflict());
        String second=party();
        var page=mvc.perform(auth(get(path).param("limit","1"),a)).andExpect(status().isOk());
        String cursor=field(page,"nextCursor");
        assertEquals(id,field(page,"items[0].id"));
        mvc.perform(auth(get(path).param("limit","1").param("cursor",cursor),a)).andExpect(jsonPath("$.data.items[0].id").value(second)).andExpect(jsonPath("$.data.nextCursor").isEmpty());
        mvc.perform(auth(get(path).param("cursor","invalid"),a)).andExpect(status().isBadRequest());
    }

    @Test void revokedSessionsCannotAccessParties() throws Exception {
        db.update("UPDATE `user` SET token_version=token_version+1 WHERE id=?",Long.valueOf(a));
        mvc.perform(auth(get(path),a)).andExpect(status().isUnauthorized());
    }
}
