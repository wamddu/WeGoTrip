package com.travel.travelbackend;

import com.jayway.jsonpath.JsonPath;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:packing-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.sql.init.schema-locations=classpath:trip-schema.sql,classpath:party-schema.sql,classpath:packing-schema.sql"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class PackingApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    String a,b,c,trip,path;

    @BeforeEach void setup() throws Exception {
        for (String table:List.of("packing_item","settlement_confirmation","expense_participant","expense","itinerary_item","saved_place","trip_party_member","trip_party","api_rate_limit","api_idempotency","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request")) db.update("DELETE FROM "+table);
        users.deleteAll();
        a=user("packing-a"); b=user("packing-b"); c=user("packing-outsider");
        trip=field(mvc.perform(auth(post("/api/v1/trips"),a).header("Idempotency-Key",key()).contentType("application/json")
            .content(content(map("title","Busan","destination","Busan","startDate","2026-10-10","endDate","2026-10-12","budget",0,"inviteeIds",List.of()))))
            .andExpect(status().isCreated()),"trip.id");
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",trip,b);
        path="/api/v1/trips/"+trip+"/packing-items";
    }
    String user(String name) { return users.saveAndFlush(new User(name,name+"@example.invalid",null,Instant.now())).getId().toString(); }
    String key() { return UUID.randomUUID().toString(); }
    static Map<String,Object> map(Object... values) {
        var result=new LinkedHashMap<String,Object>();
        for (int i=0;i<values.length;i+=2) result.put((String)values[i],values[i+1]);
        return result;
    }
    String content(Object body) { return json.writeValueAsString(body); }
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request,String who) {
        return request.with(jwt().jwt(j -> j.subject(who).claim("tokenVersion",0).claim("auth_time",Instant.now().getEpochSecond())));
    }
    <T> T field(ResultActions result,String name) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+name);
    }
    int count(String table) { return Objects.requireNonNull(db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class)); }
    ResultActions create(String who,String key,Object body) throws Exception {
        return mvc.perform(auth(post(path),who).header("Idempotency-Key",key).contentType("application/json").content(content(body)));
    }
    String item(String title,String owner) throws Exception {
        return field(create(a,key(),map("title",title,"ownerId",owner)).andExpect(status().isCreated()),"items[0].id");
    }
    String unassignedItem(String title) {
        // Existing null-assignment records are fixtures only; new API creates always assign each copy.
        db.update("INSERT INTO packing_item(trip_id,title,done) VALUES(?,?,?)",trip,title,false);
        return Objects.requireNonNull(db.queryForObject("SELECT MAX(id) FROM packing_item WHERE trip_id=?",Long.class,trip)).toString();
    }
    String state(String id) throws Exception {
        return field(mvc.perform(auth(get(path+"/"+id),a)).andExpect(status().isOk()),"stateToken");
    }
    ResultActions update(String who,String id,String key,String expected,String title,String owner) throws Exception {
        return mvc.perform(auth(put(path+"/"+id),who).header("Idempotency-Key",key).contentType("application/json")
            .content(content(map("title",title,"ownerId",owner,"expectedStateToken",expected))));
    }
    ResultActions complete(String who,String id,String key,String expected,Object done) throws Exception {
        return mvc.perform(auth(put(path+"/"+id+"/completion"),who).header("Idempotency-Key",key).contentType("application/json")
            .content(content(map("done",done,"expectedStateToken",expected))));
    }
    ResultActions remove(String who,String id,String key,String expected) throws Exception {
        return mvc.perform(auth(delete(path+"/"+id),who).header("Idempotency-Key",key).param("expectedStateToken",expected));
    }

    @Test void membersShareCrudAndPublicOwnerIdsMapToMembershipRows() throws Exception {
        String id=item("  여권  ",b), token=state(id);
        mvc.perform(auth(get(path),b)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.data.items[0].title").value("여권")).andExpect(jsonPath("$.data.items[0].ownerId").value(b))
            .andExpect(jsonPath("$.data.items[0].done").value(false)).andExpect(jsonPath("$.data.checklistStateToken").isString());
        assertEquals(db.queryForObject("SELECT id FROM trip_member WHERE trip_id=? AND user_id=?",Long.class,trip,b),
            db.queryForObject("SELECT owner_trip_member_id FROM packing_item WHERE id=?",Long.class,id));
        update(b,id,key(),token,"충전기",b).andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("충전기"))
            .andExpect(jsonPath("$.data.ownerId").value(b)).andExpect(jsonPath("$.data.done").value(false));
        complete(b,id,key(),state(id),true).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
        remove(b,id,key(),state(id)).andExpect(status().isOk()).andExpect(jsonPath("$.data.deletedId").value(id));
        assertEquals(0,count("packing_item"));
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PACKING_ITEM_NOT_FOUND"));
    }

    @Test void titleBooleanFieldsKeysAndTokensAreStrictlyValidated() throws Exception {
        create(a,key(),map("title","x".repeat(150),"ownerId",null)).andExpect(status().isCreated());
        String id=unassignedItem("여권"), token=state(id);
        for (Object title:List.of(" ","x".repeat(151),123))
            create(a,key(),map("title",title)).andExpect(status().isBadRequest());
        create(a,key(),map("title","No","done",true)).andExpect(status().isBadRequest());
        create(a,"invalid",map("title","No")).andExpect(status().isBadRequest());
        mvc.perform(auth(post(path),a).contentType("application/json").content(content(map("title","No")))).andExpect(status().isBadRequest());
        for (Object done:Arrays.asList("true",1,0,null)) complete(a,id,key(),token,done).andExpect(status().isBadRequest());
        mvc.perform(auth(put(path+"/"+id+"/completion"),a).header("Idempotency-Key",key()).contentType("application/json")
            .content(content(map("expectedStateToken",token)))).andExpect(status().isBadRequest());
        mvc.perform(auth(put(path+"/"+id),a).header("Idempotency-Key",key()).contentType("application/json")
            .content(content(map("title","No","expectedStateToken",token,"done",true)))).andExpect(status().isBadRequest());
        update(a,id,key(),"invalid","No",null).andExpect(status().isBadRequest());
        mvc.perform(auth(delete(path+"/"+id),a).header("Idempotency-Key",key())).andExpect(status().isBadRequest());
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.title").value("여권")).andExpect(jsonPath("$.data.done").value(false));
    }

    @Test void onlyAssignedMemberCanCompleteOrUndoIncludingWhenAnotherMemberOwnsTheTrip() throws Exception {
        for (String owner:List.of(a,b)) {
            String other=owner.equals(a)?b:a;
            String id=item("여권",owner), initial=state(id);
            int remembered=count("api_idempotency");
            for (boolean done:List.of(true,false))
                complete(other,id,key(),initial,done).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PACKING_OWNER_REQUIRED"));
            assertEquals(initial,state(id)); assertEquals(remembered,count("api_idempotency"));
            complete(owner,id,key(),initial,true).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
            String checked=state(id);
            remembered=count("api_idempotency");
            for (boolean done:List.of(true,false))
                complete(other,id,key(),checked,done).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PACKING_OWNER_REQUIRED"));
            mvc.perform(auth(get(path+"/"+id),other)).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
            assertEquals(checked,state(id)); assertEquals(remembered,count("api_idempotency"));
            complete(owner,id,key(),checked,false).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(false));
        }
    }

    @Test void unassignedItemsRequireAssignmentBeforeCompletion() throws Exception {
        String id=unassignedItem("구급상자"), initial=state(id);
        for (String who:List.of(a,b)) {
            mvc.perform(auth(get(path+"/"+id),who)).andExpect(status().isOk()).andExpect(jsonPath("$.data.ownerId").isEmpty());
            for (boolean done:List.of(true,false))
                complete(who,id,key(),initial,done).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
        }
        assertEquals(initial,state(id));
        update(a,id,key(),initial,"구급상자",a).andExpect(status().isOk());
        complete(b,id,key(),state(id),true).andExpect(status().isForbidden());
        complete(a,id,key(),state(id),true).andExpect(status().isOk());
    }

    @Test void allMemberCreatesAssignIndependentItemsAndOnlyEachOwnerMayCheckTheirCopy() throws Exception {
        var result=create(b,key(),map("title","  여권  ","ownerId",null)).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.items.length()").value(2));
        List<Map<String,Object>> created=field(result,"items");
        assertEquals(List.of(a,b),created.stream().map(row -> row.get("ownerId")).toList());
        assertEquals(2,count("packing_item"));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM packing_item WHERE owner_trip_member_id IS NULL",Integer.class));
        String first=(String)created.getFirst().get("id"), second=(String)created.getLast().get("id");
        for (var row:created) { assertEquals("여권",row.get("title")); assertEquals(false,row.get("done")); }
        complete(a,first,key(),state(first),true).andExpect(status().isOk());
        mvc.perform(auth(get(path),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].ownerId").value(a))
            .andExpect(jsonPath("$.data.items[0].done").value(true)).andExpect(jsonPath("$.data.items[1].ownerId").value(b))
            .andExpect(jsonPath("$.data.items[1].done").value(false));
        complete(b,first,key(),state(first),false).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PACKING_OWNER_REQUIRED"));
        complete(a,second,key(),state(second),true).andExpect(status().isForbidden());
        complete(b,second,key(),state(second),true).andExpect(status().isOk());
        complete(a,first,key(),state(first),false).andExpect(status().isOk());
        mvc.perform(auth(get(path+"/"+second),a)).andExpect(jsonPath("$.data.done").value(true));
    }

    @Test void allMemberCreatesIncludeOnlyCurrentActiveMembersAndAllowOnePerson() throws Exception {
        String withdrawn=user("packing-withdrawn");
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",trip,withdrawn);
        db.update("UPDATE `user` SET status='WITHDRAWN' WHERE id=?",withdrawn);
        create(a,key(),map("title","충전기")).andExpect(status().isCreated()).andExpect(jsonPath("$.data.items.length()").value(2))
            .andExpect(jsonPath("$.data.items[0].ownerId").value(a)).andExpect(jsonPath("$.data.items[1].ownerId").value(b));
        db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,b);
        create(a,key(),map("title","물병","ownerId",null)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.items.length()").value(1))
            .andExpect(jsonPath("$.data.items[0].ownerId").value(a)).andExpect(jsonPath("$.data.items[0].done").value(false));
        assertEquals(3,count("packing_item"));
    }

    @Test void allMemberCreateRetriesKeepTheOriginalMembershipSnapshot() throws Exception {
        String requestKey=key();
        List<String> original=field(create(a,requestKey,map("title","여권","ownerId",null)).andExpect(status().isCreated()),"items[*].id");
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",trip,c);
        List<String> replayed=field(create(a,requestKey,map("title"," 여권 ","ownerId",null)).andExpect(status().isCreated()),"items[*].id");
        assertEquals(original,replayed); assertEquals(2,count("packing_item"));
        create(a,requestKey,map("title","여권","ownerId",b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        create(a,key(),map("title","여권","ownerId",null)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.items.length()").value(3));
        assertEquals(5,count("packing_item"));
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        assertEquals(original,field(create(a,requestKey,map("title","여권","ownerId",null)).andExpect(status().isCreated()),"items[*].id"));
        create(a,key(),map("title","여권","ownerId",null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRIP_ARCHIVED"));
        assertEquals(5,count("packing_item"));
    }

    @Test void assigningUnownedCompletionStartsThePersonalItemUnchecked() throws Exception {
        String id=unassignedItem("물병");
        db.update("UPDATE packing_item SET done=1 WHERE id=?",id);
        String old=state(id);
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.done").value(true));
        update(a,id,key(),old,"물병",b).andExpect(status().isOk()).andExpect(jsonPath("$.data.ownerId").value(b))
            .andExpect(jsonPath("$.data.done").value(false));
        assertNotEquals(old,state(id));
        complete(a,id,key(),state(id),true).andExpect(status().isForbidden());
        complete(b,id,key(),state(id),true).andExpect(status().isOk());
    }

    @Test void partiallyFailedAllMemberCreateRollsBackEveryCopyAndMayRetryWithTheSameKey() throws Exception {
        String requestKey=key();
        int remembered=count("api_idempotency");
        long secondMember=Objects.requireNonNull(db.queryForObject("SELECT id FROM trip_member WHERE trip_id=? AND user_id=?",Long.class,trip,b));
        db.execute("ALTER TABLE packing_item ADD CONSTRAINT packing_fanout_failpoint CHECK(title <> 'Fanout Fail' OR owner_trip_member_id <> "+secondMember+")");
        try {
            create(a,requestKey,map("title","Fanout Fail","ownerId",null)).andExpect(status().isConflict());
            assertEquals(0,count("packing_item")); assertEquals(remembered,count("api_idempotency"));
        } finally { db.execute("ALTER TABLE packing_item DROP CONSTRAINT packing_fanout_failpoint"); }
        create(a,requestKey,map("title","Fanout Fail","ownerId",null)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.items.length()").value(2));
        assertEquals(2,count("packing_item")); assertEquals(remembered+1,count("api_idempotency"));
    }

    @Test void reassignmentRevokesOldOwnerCompletionAndReplayRightsWithoutChangingExistingStatus() throws Exception {
        String id=item("여권",b), initial=state(id), requestKey=key();
        complete(b,id,requestKey,initial,true).andExpect(status().isOk());
        update(a,id,key(),state(id),"여권",a).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
        String reassigned=state(id);
        int remembered=count("api_idempotency");
        complete(b,id,requestKey,initial,true).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PACKING_OWNER_REQUIRED"));
        for (boolean done:List.of(true,false))
            complete(b,id,key(),reassigned,done).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PACKING_OWNER_REQUIRED"));
        assertEquals(reassigned,state(id)); assertEquals(remembered,count("api_idempotency"));
        complete(a,id,key(),reassigned,false).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(false));
        String assigned=state(id);
        update(a,id,key(),assigned,"공용 여권 보관",null).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
        assertEquals(assigned,state(id));
    }

    @Test void ownersMustBeActiveCurrentMembersOfThisTrip() throws Exception {
        String id=unassignedItem("여권"), token=state(id);
        for (String invalid:List.of(c,"999999")) {
            create(a,key(),map("title","No","ownerId",invalid)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("PACKING_MEMBER_NOT_IN_TRIP"));
            update(a,id,key(),token,"No",invalid).andExpect(status().isBadRequest());
        }
        create(a,key(),map("title","No","ownerId",Long.valueOf(b))).andExpect(status().isBadRequest());
        db.update("UPDATE `user` SET status='WITHDRAWN' WHERE id=?",b);
        create(a,key(),map("title","No","ownerId",b)).andExpect(status().isBadRequest());
        db.update("UPDATE `user` SET status='ACTIVE' WHERE id=?",b);
        db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,b);
        create(a,key(),map("title","No","ownerId",b)).andExpect(status().isBadRequest());
        assertEquals(1,count("packing_item"));
        assertEquals(token,state(id));
    }

    @Test void outsidersCrossTripIdsAndRevokedTokensCannotReadOrWrite() throws Exception {
        String id=unassignedItem("여권"), token=state(id);
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(auth(get(path),c)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRIP_NOT_FOUND"));
        create(c,key(),map("title","No")).andExpect(status().isNotFound());
        update(c,id,key(),token,"No",a).andExpect(status().isNotFound());
        complete(c,id,key(),token,true).andExpect(status().isNotFound());
        remove(c,id,key(),token).andExpect(status().isNotFound());
        db.update("INSERT INTO trip(id,name,destination,start_date,end_date,owner_id,created_at,updated_at) VALUES(99999,'Other','Other','2026-10-10','2026-10-12',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",a);
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(99999,?,CURRENT_TIMESTAMP)",a);
        String other="/api/v1/trips/99999/packing-items/"+id;
        mvc.perform(auth(get(other),a)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PACKING_ITEM_NOT_FOUND"));
        mvc.perform(auth(put(other),a).header("Idempotency-Key",key()).contentType("application/json")
            .content(content(map("title","No","ownerId",a,"expectedStateToken",token)))).andExpect(status().isNotFound());
        mvc.perform(auth(put(other+"/completion"),a).header("Idempotency-Key",key()).contentType("application/json")
            .content(content(map("done",true,"expectedStateToken",token)))).andExpect(status().isNotFound());
        mvc.perform(auth(delete(other),a).header("Idempotency-Key",key()).param("expectedStateToken",token)).andExpect(status().isNotFound());
        db.update("UPDATE `user` SET token_version=token_version+1 WHERE id=?",a);
        mvc.perform(auth(get(path),a)).andExpect(status().isUnauthorized());
        complete(a,id,key(),token,true).andExpect(status().isUnauthorized());
    }

    @Test void archivedTripsAreReadableAndNewWritesAreRejected() throws Exception {
        String id=item("여권",b), token=state(id);
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        mvc.perform(auth(get(path),b)).andExpect(status().isOk());
        mvc.perform(auth(get(path+"/"+id),b)).andExpect(status().isOk());
        create(a,key(),map("title","No")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRIP_ARCHIVED"));
        update(b,id,key(),token,"No",b).andExpect(status().isConflict());
        complete(b,id,key(),token,true).andExpect(status().isConflict());
        remove(b,id,key(),token).andExpect(status().isConflict());
        assertEquals(token,state(id));
    }

    @Test void metadataAndCompletionNeverOverwriteEachOtherAndStaleDeletesFail() throws Exception {
        String id=item("여권",b), first=state(id);
        complete(b,id,key(),first,true).andExpect(status().isOk());
        String checked=state(id); assertNotEquals(first,checked);
        update(a,id,key(),first,"보조배터리",b).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACKING_ITEM_CONFLICT"));
        update(a,id,key(),checked,"보조배터리",b).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
        complete(b,id,key(),checked,false).andExpect(status().isConflict());
        remove(b,id,key(),checked).andExpect(status().isConflict());
        complete(b,id,key(),state(id),false).andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("보조배터리"))
            .andExpect(jsonPath("$.data.ownerId").value(b));
        assertEquals(1,count("packing_item"));
    }

    @Test void replayedCreatesUpdatesCompletionsAndDeletesReturnTheirOriginalResponse() throws Exception {
        String createKey=key();
        String id=field(create(a,createKey,map("title","  여권  ","ownerId",b)).andExpect(status().isCreated()),"items[0].id");
        assertEquals(id,field(create(a,createKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0].id"));
        create(a,createKey,map("title","Other","ownerId",b)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        String first=state(id), updateKey=key();
        String updated=field(update(a,id,updateKey,first,"충전기",b).andExpect(status().isOk()),"stateToken");
        String completeKey=key();
        String completed=field(complete(b,id,completeKey,updated,true).andExpect(status().isOk()),"stateToken");
        update(a,id,updateKey,first,"충전기",b).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(false));
        assertEquals(completed,state(id));
        complete(b,id,completeKey,updated,true).andExpect(status().isOk()).andExpect(jsonPath("$.data.done").value(true));
        complete(b,id,completeKey,updated,false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        String deleteKey=key();
        remove(b,id,deleteKey,completed).andExpect(status().isOk());
        remove(b,id,deleteKey,completed).andExpect(status().isOk()).andExpect(jsonPath("$.data.deletedId").value(id));
        remove(b,id,deleteKey,first).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        update(a,id,updateKey,first,"충전기",b).andExpect(status().isOk());
        complete(b,id,completeKey,updated,true).andExpect(status().isOk());
        assertEquals(0,count("packing_item"));
    }

    @Test void replayWorksAfterArchiveButRequiresCurrentAuthenticationAndMembership() throws Exception {
        String requestKey=key();
        String id=field(create(b,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0].id");
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        assertEquals(id,field(create(b,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0].id"));
        db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,b);
        create(b,requestKey,map("title","여권","ownerId",b)).andExpect(status().isNotFound());
        db.update("UPDATE `user` SET token_version=token_version+1 WHERE id=?",b);
        create(b,requestKey,map("title","여권","ownerId",b)).andExpect(status().isUnauthorized());
    }

    @Test void cachedPersonalSingleCreateResponsesAreReplayedInTheBatchEnvelopeWithoutNewRows() throws Exception {
        String requestKey=key();
        Map<String,Object> created=field(create(a,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0]");
        db.update("UPDATE api_idempotency SET response_body=? WHERE operation='packing.create' AND request_key=?",content(created),requestKey);
        var replay=create(a,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.legacy").doesNotExist()).andExpect(jsonPath("$.data.items.length()").value(1))
            .andExpect(jsonPath("$.data.items[0].id").value(created.get("id")));
        assertEquals(created,field(replay,"items[0]"));
        assertEquals(1,count("packing_item"));
    }

    @Test void cachedUnassignedSingleCreateResponsesAreRejectedWithoutRecreatingDeletedItems() throws Exception {
        String requestKey=key();
        List<Map<String,Object>> created=field(create(a,requestKey,map("title","여권","ownerId",null)).andExpect(status().isCreated()),"items");
        var cached=new LinkedHashMap<>(created.getFirst()); cached.put("ownerId",null);
        db.update("UPDATE api_idempotency SET response_body=? WHERE operation='packing.create' AND request_key=?",content(cached),requestKey);
        db.update("DELETE FROM packing_item WHERE trip_id=?",trip);
        int remembered=count("api_idempotency");
        create(a,requestKey,map("title","여권","ownerId",null)).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
        assertEquals(0,count("packing_item")); assertEquals(remembered,count("api_idempotency"));
        assertEquals(content(cached),db.queryForObject("SELECT response_body FROM api_idempotency WHERE operation='packing.create' AND request_key=?",String.class,requestKey));
        create(a,key(),map("title","여권","ownerId",null)).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.items.length()").value(2));
    }

    @Test void completionReplayRequiresAnAssignedOwnerWhenTheExistingItemLosesItsAssignment() throws Exception {
        String id=item("여권",a), expected=state(id), requestKey=key();
        complete(a,id,requestKey,expected,true).andExpect(status().isOk());
        db.update("UPDATE packing_item SET owner_trip_member_id=NULL WHERE id=?",id);
        String unassigned=state(id); int remembered=count("api_idempotency");
        complete(a,id,requestKey,expected,true).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
        assertEquals(unassigned,state(id)); assertEquals(remembered,count("api_idempotency"));
    }

    @Test void expiredIdempotencyRecordsAreReplacedAfterTwentyFourHours() throws Exception {
        String requestKey=key();
        unassignedItem("Existing");
        String id=field(create(a,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0].id");
        db.update("UPDATE api_idempotency SET expires_at=TIMESTAMP '2000-01-01 00:00:00' WHERE operation='packing.create' AND request_key=?",requestKey);
        assertNotEquals(id,field(create(a,requestKey,map("title","여권","ownerId",b)).andExpect(status().isCreated()),"items[0].id"));
        assertEquals(3,count("packing_item"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM api_idempotency WHERE operation='packing.create' AND request_key=?",Integer.class,requestKey));
    }

    @Test void snapshotPaginationOrdersIdsAndRejectsChangesAnywhereInTheList() throws Exception {
        String first=unassignedItem("First"), second=item("Second",b), third=item("Third",a);
        var page=mvc.perform(auth(get(path).param("limit","1"),b)).andExpect(status().isOk());
        String cursor=field(page,"nextCursor"), snapshot=field(page,"checklistStateToken");
        assertEquals(first,field(page,"items[0].id"));
        var middle=mvc.perform(auth(get(path).param("limit","1").param("cursor",cursor),a)).andExpect(status().isOk());
        assertEquals(second,field(middle,"items[0].id")); assertEquals(snapshot,field(middle,"checklistStateToken"));
        String middleCursor=field(middle,"nextCursor");
        mvc.perform(auth(get(path).param("limit","1").param("cursor",middleCursor),b)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(third)).andExpect(jsonPath("$.data.nextCursor").isEmpty());
        complete(a,third,key(),state(third),true).andExpect(status().isOk());
        changedPage(cursor);
        cursor=field(mvc.perform(auth(get(path).param("limit","1"),a)),"nextCursor");
        update(a,first,key(),state(first),"First changed",a).andExpect(status().isOk()); changedPage(cursor);
        cursor=field(mvc.perform(auth(get(path).param("limit","1"),a)),"nextCursor");
        remove(a,second,key(),state(second)).andExpect(status().isOk()); changedPage(cursor);
        cursor=field(mvc.perform(auth(get(path).param("limit","1"),a)),"nextCursor");
        item("Added",a); changedPage(cursor);
    }
    void changedPage(String cursor) throws Exception {
        mvc.perform(auth(get(path).param("limit","1").param("cursor",cursor),b)).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PACKING_LIST_CHANGED"));
    }

    @Test void cursorTripTokenLimitAndEmptyListAreValidated() throws Exception {
        mvc.perform(auth(get(path),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty())
            .andExpect(jsonPath("$.data.nextCursor").isEmpty()).andExpect(jsonPath("$.data.checklistStateToken").isString());
        for (String limit:List.of("0","101","text")) mvc.perform(auth(get(path).param("limit",limit),a)).andExpect(status().isBadRequest());
        for (String cursor:List.of("invalid",encoded("packing|99999|"+"a".repeat(64)+"|1"),encoded("packing|"+trip+"|invalid|1"),encoded("packing|"+trip+"|"+"a".repeat(64)+"|0")))
            mvc.perform(auth(get(path).param("cursor",cursor),a)).andExpect(status().isBadRequest());
    }
    String encoded(String cursor) { return Base64.getUrlEncoder().withoutPadding().encodeToString(cursor.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }

    @Test void withdrawnAssignedMembersLoseAssignmentWithoutResettingCompletion() throws Exception {
        String id=item("여권",b), first=state(id);
        complete(b,id,key(),first,true).andExpect(status().isOk());
        String completed=state(id);
        mvc.perform(auth(delete("/api/v1/users/me"),b)).andExpect(status().isOk());
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.ownerId").isEmpty())
            .andExpect(jsonPath("$.data.done").value(true));
        assertNotEquals(completed,state(id));
        update(a,id,key(),completed,"No",a).andExpect(status().isConflict());
        create(a,key(),map("title","No","ownerId",b)).andExpect(status().isBadRequest());
        complete(a,id,key(),state(id),false).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
    }

    @Test void tripDeletionCascadesAndBigintIdsRemainStrings() throws Exception {
        String id="9007199254740993";
        db.update("INSERT INTO packing_item(id,trip_id,title,done) VALUES(?,?,?,?)",id,trip,"Exact ID",false);
        mvc.perform(auth(get(path+"/"+id),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
        complete(b,id,key(),state(id),true).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PACKING_ASSIGNMENT_REQUIRED"));
        update(b,id,key(),state(id),"Exact ID",b).andExpect(status().isOk());
        complete(b,id,key(),state(id),true).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
        db.update("DELETE FROM trip WHERE id=?",trip);
        assertEquals(0,count("packing_item"));
    }

    @Test void failedWritesRollbackIdempotencyAndCanRetryWithTheSameKey() throws Exception {
        String id=unassignedItem("여권"), expected=state(id), createKey=key(), updateKey=key();
        int remembered=count("api_idempotency");
        db.execute("ALTER TABLE packing_item ADD CONSTRAINT packing_test_failpoint CHECK(title <> 'Fail')");
        try {
            create(a,createKey,map("title","Fail")).andExpect(status().isConflict());
            update(b,id,updateKey,expected,"Fail",b).andExpect(status().isConflict());
            assertEquals(1,count("packing_item")); assertEquals(expected,state(id)); assertEquals(remembered,count("api_idempotency"));
        } finally { db.execute("ALTER TABLE packing_item DROP CONSTRAINT packing_test_failpoint"); }
        create(a,createKey,map("title","Fail")).andExpect(status().isCreated());
        update(b,id,updateKey,expected,"Fail",b).andExpect(status().isOk());
    }

    record Response(int status,String body) {}
    Response response(MockHttpServletRequestBuilder request) throws Exception {
        var result=mvc.perform(request).andReturn().getResponse();
        return new Response(result.getStatus(),result.getContentAsString());
    }
    List<Response> race(Callable<Response> first,Callable<Response> second) throws Exception {
        var ready=new CyclicBarrier(2);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var one=executor.submit(() -> { ready.await(); return first.call(); });
            var two=executor.submit(() -> { ready.await(); return second.call(); });
            return List.of(one.get(20,TimeUnit.SECONDS),two.get(20,TimeUnit.SECONDS));
        }
    }
    @Test void concurrentDuplicateCreatesPersistOnlyOneItem() throws Exception {
        String requestKey=key(), body=content(map("title","여권","ownerId",b));
        var results=race(
            () -> response(auth(post(path),a).header("Idempotency-Key",requestKey).contentType("application/json").content(body)),
            () -> response(auth(post(path),a).header("Idempotency-Key",requestKey).contentType("application/json").content(body)));
        assertEquals(List.of(201,201),results.stream().map(Response::status).toList(),results.toString());
        assertEquals(JsonPath.<String>read(results.getFirst().body(),"$.data.items[0].id"),JsonPath.<String>read(results.getLast().body(),"$.data.items[0].id"));
        assertEquals(1,count("packing_item"));
    }
    @Test void concurrentDuplicateAllMemberCreatesPersistOnlyOneCopyPerMember() throws Exception {
        String requestKey=key(), body=content(map("title","물병","ownerId",null));
        var results=race(
            () -> response(auth(post(path),a).header("Idempotency-Key",requestKey).contentType("application/json").content(body)),
            () -> response(auth(post(path),a).header("Idempotency-Key",requestKey).contentType("application/json").content(body)));
        assertEquals(List.of(201,201),results.stream().map(Response::status).toList(),results.toString());
        assertEquals(JsonPath.<List<String>>read(results.getFirst().body(),"$.data.items[*].id"),
            JsonPath.<List<String>>read(results.getLast().body(),"$.data.items[*].id"));
        assertEquals(2,count("packing_item"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM api_idempotency WHERE operation='packing.create' AND request_key=?",Integer.class,requestKey));
    }
    @Test void simultaneousMetadataAndCompletionRequestsCommitOnlyOneExpectedState() throws Exception {
        String id=item("여권",b), expected=state(id);
        var results=race(
            () -> response(auth(put(path+"/"+id),a).header("Idempotency-Key",key()).contentType("application/json")
                .content(content(map("title","충전기","ownerId",b,"expectedStateToken",expected)))),
            () -> response(auth(put(path+"/"+id+"/completion"),b).header("Idempotency-Key",key()).contentType("application/json")
                .content(content(map("done",true,"expectedStateToken",expected)))));
        assertEquals(List.of(200,409),results.stream().map(Response::status).sorted().toList(),results.toString());
        for (var result:results) if (result.status()==409) assertEquals("PACKING_ITEM_CONFLICT",JsonPath.read(result.body(),"$.code"));
        if (results.getFirst().status()==200) mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.title").value("충전기")).andExpect(jsonPath("$.data.done").value(false));
        else mvc.perform(auth(get(path+"/"+id),a)).andExpect(jsonPath("$.data.title").value("여권")).andExpect(jsonPath("$.data.done").value(true));
    }
    @Test void assignmentAndMemberWithdrawalSerializeWithoutDanglingOwners() throws Exception {
        var results=race(
            () -> response(auth(delete("/api/v1/users/me"),b)),
            () -> response(auth(post(path),a).header("Idempotency-Key",key()).contentType("application/json").content(content(map("title","여권","ownerId",b)))));
        assertEquals(200,results.getFirst().status(),results.toString());
        assertTrue(List.of(201,400).contains(results.getLast().status()),results.toString());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM packing_item WHERE owner_trip_member_id IS NOT NULL",Integer.class));
        assertFalse(users.existsById(Long.valueOf(b)));
    }
}
