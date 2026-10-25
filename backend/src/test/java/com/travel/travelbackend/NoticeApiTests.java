package com.travel.travelbackend;

import com.jayway.jsonpath.JsonPath;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import com.travel.travelbackend.tripapi.NoticeService;
import com.travel.travelbackend.notifications.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:notice-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.sql.init.schema-locations=classpath:trip-schema.sql,classpath:party-schema.sql,classpath:chat-schema.sql,classpath:push-schema.sql,classpath:notice-schema.sql",
    "push.enabled=true","push.worker-enabled=false"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class NoticeApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;
    @Autowired NoticeService notices;
    @Autowired PushWorker worker;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean PushSender sender;
    @MockitoBean Clock clock;
    String owner,member,disabled,muted,outsider,trip,path;
    Instant now=Instant.parse("2026-10-25T09:00:00Z");
    @BeforeEach void setup() throws Exception {
        when(clock.instant()).thenReturn(now);when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        when(sender.available()).thenReturn(true);when(sender.send(any())).thenReturn(PushSender.Result.accepted());
        for(String table:List.of("push_delivery","push_event","trip_notice","chat_poll_vote","chat_poll_option","chat_poll","chat_message","chat_image_upload","itinerary_item","saved_place","trip_party_member","trip_party","api_rate_limit","api_idempotency","api_rate_limit","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request","user_device","user_setting"))db.update("DELETE FROM "+table);
        users.deleteAll();owner=user("owner",true);member=user("member",true);disabled=user("disabled",false);muted=user("muted",true);outsider=user("outsider",true);
        trip=field(postAs("/api/v1/trips",owner,UUID.randomUUID().toString(),Map.of("title","Trip","destination","Busan","startDate","2026-10-25","endDate","2026-10-27","budget",0,"inviteeIds",List.of())).andExpect(status().isCreated()),"trip.id");
        for(String user:List.of(member,disabled,muted))db.update("INSERT INTO trip_member(trip_id,user_id,notification_enabled,joined_at) VALUES(?,?,?,?)",trip,user,!user.equals(muted),Timestamp.from(now));
        for(String user:List.of(owner,member,disabled,muted,outsider))db.update("INSERT INTO user_device(user_id,fcm_token,device_type,created_at,last_active_at) VALUES(?,?,'ANDROID',?,?)",user,"token-"+user,Timestamp.from(now),Timestamp.from(now));
        path="/api/v1/trips/"+trip+"/notices";
    }
    String user(String name,boolean enabled) {
        String id=users.saveAndFlush(new User(name,name+"@example.invalid",null,now)).getId().toString();
        db.update("INSERT INTO user_setting(user_id,push_notification_enabled,location_sharing_enabled) VALUES(?,?,FALSE)",id,enabled);return id;
    }
    ResultActions postAs(String uri,String actor,String key,Object body) throws Exception {
        return mvc.perform(post(uri).with(jwt().jwt(j->j.subject(actor).claim("tokenVersion",0))).header("Idempotency-Key",key).contentType("application/json").content(json.writeValueAsString(body)));
    }
    ResultActions putAs(String id,String actor,Object body) throws Exception {
        return mvc.perform(put(path+"/"+id).with(jwt().jwt(j->j.subject(actor).claim("tokenVersion",0))).header("Idempotency-Key",UUID.randomUUID().toString()).contentType("application/json").content(json.writeValueAsString(body)));
    }
    ResultActions getAs(String uri,String actor) throws Exception { return mvc.perform(get(uri).with(jwt().jwt(j->j.subject(actor).claim("tokenVersion",0)))); }
    ResultActions deleteAs(String id,String actor,String version,String key) throws Exception { return mvc.perform(delete(path+"/"+id).param("expectedVersion",version).header("Idempotency-Key",key).with(jwt().jwt(j->j.subject(actor).claim("tokenVersion",0)))); }
    Map<String,Object> input() { return Map.of("title","secret title","body","secret body","pinned",true); }
    Map<String,Object> update(String version) { return Map.of("title","updated","body","updated body","pinned",false,"expectedVersion",version); }
    String field(ResultActions result,String field) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+field); }
    String create() throws Exception { return field(postAs(path,owner,UUID.randomUUID().toString(),input()).andExpect(status().isCreated()),"id"); }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }
    @Test void onlyOwnerManagesNoticesAndCurrentMembersReadSharedData() throws Exception {
        String id=create();getAs(path,member).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(id));
        getAs(path+"/"+id,member).andExpect(status().isOk()).andExpect(jsonPath("$.data.authorId").value(owner)).andExpect(jsonPath("$.data.pinned").value(true));
        postAs(path,member,UUID.randomUUID().toString(),input()).andExpect(status().isForbidden());
        putAs(id,member,update("0")).andExpect(status().isForbidden());deleteAs(id,member,"0",UUID.randomUUID().toString()).andExpect(status().isForbidden());
        getAs(path,outsider).andExpect(status().isNotFound());getAs(path+"/"+id,outsider).andExpect(status().isNotFound());
        db.update("UPDATE trip_notice SET author_id=? WHERE id=?",member,id);
        putAs(id,member,update("0")).andExpect(status().isForbidden());
    }
    @Test void createsAreIdempotentAndQueueOnlyEligibleDevicesWithGenericPayloads() throws Exception {
        db.update("INSERT INTO user_device(user_id,fcm_token,device_type,created_at,last_active_at) VALUES(?,'second-device','ANDROID',?,?)",member,Timestamp.from(now),Timestamp.from(now));
        String key=UUID.randomUUID().toString();postAs(path,owner,key,input()).andExpect(status().isCreated());postAs(path,owner,key,input()).andExpect(status().isCreated());
        assertEquals(1,count("trip_notice"));assertEquals(1,count("push_event"));assertEquals(0,count("push_delivery"));verify(sender,never()).send(any());
        postAs(path,owner,key,Map.of("title","different","body","changed","pinned",true)).andExpect(status().isConflict());
        assertEquals(2,worker.drain());verify(sender,times(2)).send(argThat(message->message.data().get("type").equals("TRIP_NOTICE")&&message.data().get("recipientId").equals(member)&&message.data().get("tripId").equals(trip)&&!message.body().contains("secret")&&!message.title().contains("secret")));
        assertEquals(0,worker.drain());
    }
    @Test void noticeAndPushSnapshotRollBackTogether() {
        new TransactionTemplate(manager).executeWithoutResult(status->{
            notices.create(Jwt.withTokenValue("test").header("alg","none").subject(owner).claim("tokenVersion",0).build(),trip,UUID.randomUUID().toString(),input());
            assertEquals(1,count("push_event"));status.setRollbackOnly();
        });
        assertEquals(0,count("trip_notice"));assertEquals(0,count("push_event"));
    }
    @Test void staleUpdatesAndDeletesAreRejectedAndDoNotNotifyAgain() throws Exception {
        String id=create();putAs(id,owner,update("0")).andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value("1"));
        putAs(id,owner,update("0")).andExpect(status().isConflict());deleteAs(id,owner,"0",UUID.randomUUID().toString()).andExpect(status().isConflict());
        getAs(path+"/"+id,member).andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("updated"));
        String key=UUID.randomUUID().toString();deleteAs(id,owner,"1",key).andExpect(status().isOk());deleteAs(id,owner,"1",key).andExpect(status().isOk());
        assertEquals(1,count("push_event"));assertEquals(1,worker.drain());verify(sender,never()).send(any());
        getAs(path+"/"+id,member).andExpect(status().isNotFound());
    }
    @Test void revokedMembershipSettingsAndRotatedTokensAreRechecked() throws Exception {
        create();db.update("UPDATE trip_member SET notification_enabled=FALSE WHERE trip_id=? AND user_id=?",trip,member);assertEquals(1,worker.drain());
        db.update("UPDATE trip_member SET notification_enabled=TRUE WHERE trip_id=? AND user_id=?",trip,member);create();
        db.update("UPDATE user_setting SET push_notification_enabled=FALSE WHERE user_id=?",member);assertEquals(1,worker.drain());
        db.update("UPDATE user_setting SET push_notification_enabled=TRUE WHERE user_id=?",member);create();
        db.update("UPDATE user_device SET fcm_token='rotated' WHERE user_id=?",member);assertEquals(1,worker.drain());
        create();db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,member);assertEquals(1,worker.drain());
        verify(sender,never()).send(any());assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM push_delivery WHERE status='SKIPPED'",Integer.class));
    }
    @Test void archivedTripsRemainReadableButCannotBeChangedOrNotified() throws Exception {
        String id=create();db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        getAs(path,member).andExpect(status().isOk());postAs(path,owner,UUID.randomUUID().toString(),input()).andExpect(status().isConflict());
        putAs(id,owner,update("0")).andExpect(status().isConflict());deleteAs(id,owner,"0",UUID.randomUUID().toString()).andExpect(status().isConflict());
        assertEquals(1,worker.drain());verify(sender,never()).send(any());
    }
    @Test void validatesPayloadsAndKeepsPaginationScopedToTrip() throws Exception {
        String first=create(),second=create();
        var page=getAs(path+"?limit=1",member).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(second));
        String cursor=field(page,"nextCursor");mvc.perform(get(path).param("cursor",cursor).param("limit","1").with(jwt().jwt(j->j.subject(member).claim("tokenVersion",0)))).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(first));
        getAs(path+"?limit=0",member).andExpect(status().isBadRequest());getAs(path+"?cursor=invalid",member).andExpect(status().isBadRequest());
        postAs(path,owner,UUID.randomUUID().toString(),Map.of("title"," ","body","a","pinned",false)).andExpect(status().isBadRequest());
        postAs(path,owner,UUID.randomUUID().toString(),Map.of("title","a".repeat(101),"body","a","pinned",false)).andExpect(status().isBadRequest());
        postAs(path,owner,UUID.randomUUID().toString(),Map.of("title","a","body","a","pinned",false,"authorId",member)).andExpect(status().isBadRequest());
        putAs(first,owner,update("9223372036854775808")).andExpect(status().isBadRequest());
    }
}
