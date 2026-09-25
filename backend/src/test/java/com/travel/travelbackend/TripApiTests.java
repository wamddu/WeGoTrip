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
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:trip-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc @ActiveProfiles("test")
class TripApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    String a,b,c;
    @BeforeEach void setup(){
        for(String table:List.of("api_rate_limit","api_idempotency","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request"))db.update("DELETE FROM "+table);
        users.deleteAll();a=user("a");b=user("b");c=user("c");
    }
    String user(String name){return users.saveAndFlush(new User(name,name+"@example.invalid",null,Instant.now())).getId().toString();}
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder req,String who){return req.with(jwt().jwt(j->j.subject(who).claim("tokenVersion",0).claim("auth_time",Instant.now().getEpochSecond())));}
    ResultActions postAs(String path,String who,String body)throws Exception{return mvc.perform(auth(post("/api/v1"+path),who).contentType("application/json").content(body));}
    String field(ResultActions result,String path)throws Exception{return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+path);}
    String friend(String from,String to)throws Exception{return field(postAs("/friend-requests",from,"{\"recipientId\":\""+to+"\"}").andExpect(status().isCreated()),"id");}
    void befriend()throws Exception{postAs("/friend-requests/"+friend(a,b)+"/accept",b,"").andExpect(status().isOk());}
    String body(String invitees){return "{\"title\":\"Busan\",\"destination\":\"Busan\",\"startDate\":\"2026-10-10\",\"endDate\":\"2026-10-12\",\"budget\":600000,\"inviteeIds\":"+invitees+"}";}
    ResultActions create(String who,String key,String body)throws Exception{return mvc.perform(auth(post("/api/v1/trips"),who).header("Idempotency-Key",key).contentType("application/json").content(body));}
    String trip()throws Exception{return field(create(a,UUID.randomUUID().toString(),body("[]")).andExpect(status().isCreated()),"trip.id");}
    String code(String id)throws Exception{return field(postAs("/trips/"+id+"/invite-code",a,"").andExpect(status().isCreated()),"code");}
    ResultActions join(String who,String code)throws Exception{return postAs("/trip-join",who,"{\"code\":\""+code+"\"}");}
    @Test void routesRequireAuthenticationAndVersion()throws Exception{
        for(String path:List.of("/trips","/friends","/friend-requests","/users/me/trip-invitations"))mvc.perform(get("/api/v1"+path)).andExpect(status().isUnauthorized());
        db.update("UPDATE `user` SET token_version=1 WHERE id=?",a);
        mvc.perform(auth(get("/api/v1/trips"),a)).andExpect(status().isUnauthorized());
        mvc.perform(options("/api/v1/trips").header("Origin","http://localhost:8081").header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","authorization,idempotency-key,content-type")).andExpect(status().isOk());
    }
    @Test void lookupAndFriendConsentPreservePrivacy()throws Exception{
        postAs("/users/lookup",a,"{\"email\":\" B@EXAMPLE.INVALID \"}").andExpect(status().isOk()).andExpect(jsonPath("$.data.user.id").value(b)).andExpect(jsonPath("$.data.user.email").doesNotExist());
        String id=friend(a,b);
        postAs("/friend-requests",b,"{\"recipientId\":\""+a+"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM friendship",Integer.class));
        postAs("/friend-requests/"+id+"/accept",c,"").andExpect(status().isNotFound());
        postAs("/friend-requests/"+id+"/accept",b,"").andExpect(status().isOk());
        postAs("/friend-requests/"+id+"/accept",b,"").andExpect(status().isOk());
        postAs("/friend-requests/"+id+"/decline",b,"").andExpect(status().isConflict());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM friendship",Integer.class));
        for(String who:List.of(a,b))mvc.perform(auth(get("/api/v1/friends"),who)).andExpect(jsonPath("$.data.items.length()").value(1));
    }
    @Test void declinedRequestsCanBeSentAgainAndDeleteIsIdempotent()throws Exception{
        String first=friend(a,b);postAs("/friend-requests/"+first+"/decline",b,"").andExpect(status().isOk());
        assertNotEquals(first,friend(a,b));
        mvc.perform(auth(delete("/api/v1/friends/"+b),a)).andExpect(status().isOk());
        postAs("/friend-requests",a,"{\"recipientId\":\""+a+"\"}").andExpect(status().isBadRequest());
    }
    @Test void createAtomicConsentAndIdempotency()throws Exception{
        String key=UUID.randomUUID().toString();
        create(a,key,body("[\""+b+"\"]")).andExpect(status().isBadRequest());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM trip",Integer.class));befriend();
        var first=create(a,key,body("[\""+b+"\"]")).andExpect(status().isCreated()).andExpect(jsonPath("$.data.trip.memberCount").value(1));
        String id=field(first,"trip.id");
        create(a,key,body("[\""+b+"\"]")).andExpect(status().isCreated()).andExpect(jsonPath("$.data.trip.id").value(id));
        create(a,key,body("[]")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM trip",Integer.class));
        mvc.perform(auth(get("/api/v1/trips/"+id),b)).andExpect(status().isNotFound());
        String invitation=field(first,"invitations[0].id");
        postAs("/trip-invitations/"+invitation+"/accept",c,"").andExpect(status().isNotFound());
        for(int i=0;i<2;i++)postAs("/trip-invitations/"+invitation+"/accept",b,"").andExpect(status().isOk());
        mvc.perform(auth(get("/api/v1/trips/"+id),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data.memberCount").value(2)).andExpect(jsonPath("$.data.owner.email").doesNotExist());
    }
    @Test void codePreviewReplacementAndArchive()throws Exception{
        String id=trip(),old=code(id);assertEquals(26,old.length());
        assertNotEquals(old,db.queryForObject("SELECT digest FROM trip_invite_code",String.class));
        postAs("/trip-join/preview",b,"{\"code\":\""+old+"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.data.alreadyMember").value(false));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM trip_member",Integer.class));
        String next=code(id);join(b,old).andExpect(status().isNotFound());join(b,next.toLowerCase()).andExpect(status().isCreated());join(b,next).andExpect(status().isOk());
        postAs("/trips/"+id+"/invite-code",b,"").andExpect(status().isForbidden());
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":0,\"status\":\"ARCHIVED\"}")).andExpect(status().isOk());
        join(c,next).andExpect(status().isNotFound());
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":1,\"title\":\"no\"}")).andExpect(status().isConflict());
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":1,\"status\":\"ACTIVE\"}")).andExpect(status().isOk());join(c,next).andExpect(status().isNotFound());
    }
    @Test void pendingInviteAcceptsByCodeAndExpiryIsEnforced()throws Exception{
        befriend();String id=trip();String inv=field(postAs("/trips/"+id+"/invitations",a,"{\"inviteeId\":\""+b+"\"}").andExpect(status().isCreated()),"id");
        db.update("UPDATE trip_invitation SET expires_at=? WHERE id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),inv);
        postAs("/trip-invitations/"+inv+"/accept",b,"").andExpect(status().isGone());
        String newInv=field(postAs("/trips/"+id+"/invitations",a,"{\"inviteeId\":\""+b+"\"}").andExpect(status().isCreated()),"id");assertNotEquals(inv,newInv);
        join(b,code(id)).andExpect(status().isCreated());assertEquals("ACCEPTED",db.queryForObject("SELECT status FROM trip_invitation WHERE id=?",String.class,newInv));
        postAs("/trip-invitations/"+newInv+"/accept",b,"").andExpect(status().isOk());
    }
    @Test void strictInputsAndVersionProtectUpdates()throws Exception{
        for(String invalid:List.of(body("[]").replace("600000","1.5"),body("[]").replace("600000","18446744073709551616"),body("[]").replace("2026-10-12","2026-02-30"),body("[]").replace("\"title\"","\"ownerId\"")))create(a,UUID.randomUUID().toString(),invalid).andExpect(status().isBadRequest());
        String id=trip();
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":1,\"title\":\"X\"}")).andExpect(status().isConflict());
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":0,\"title\":null}")).andExpect(status().isBadRequest());
        mvc.perform(auth(get("/api/v1/trips?cursor=garbage"),a)).andExpect(status().isBadRequest());
    }
    @Test void paginationDoesNotRepeatRows()throws Exception{
        trip();trip();trip();
        var first=mvc.perform(auth(get("/api/v1/trips?limit=2"),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items.length()").value(2));
        String cursor=field(first,"nextCursor"),id=field(first,"items[0].id");
        var next=mvc.perform(auth(get("/api/v1/trips").param("limit","2").param("cursor",cursor),a)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.nextCursor").isEmpty());assertNotEquals(id,field(next,"items[0].id"));
    }
    @Test void rateLimitCountsInvalidAttempts()throws Exception{
        for(int i=0;i<10;i++)postAs("/trip-join/preview",a,"{\"code\":\"invalid\"}").andExpect(status().isNotFound());
        postAs("/trip-join/preview",a,"{\"code\":\"invalid\"}").andExpect(status().isTooManyRequests());
    }
    @Test void finalSeatConcurrentJoinsCannotOverfill()throws Exception{
        String id=trip(),code=code(id);db.update("UPDATE trip SET max_members=2 WHERE id=?",id);
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var f1=pool.submit(()->{start.await();return join(b,code).andReturn().getResponse().getStatus();});
            var f2=pool.submit(()->{start.await();return join(c,code).andReturn().getResponse().getStatus();});start.countDown();
            assertEquals(Set.of(201,409),Set.of(f1.get(10,TimeUnit.SECONDS),f2.get(10,TimeUnit.SECONDS)));
        }
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM trip_member WHERE trip_id=?",Integer.class,id));
    }
    @Test void reciprocalFriendRequestsConcurrentProduceOnePending()throws Exception{
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){
            var f1=pool.submit(()->{start.await();return postAs("/friend-requests",a,"{\"recipientId\":\""+b+"\"}").andReturn().getResponse().getStatus();});
            var f2=pool.submit(()->{start.await();return postAs("/friend-requests",b,"{\"recipientId\":\""+a+"\"}").andReturn().getResponse().getStatus();});start.countDown();
            assertEquals(Set.of(200,201),Set.of(f1.get(10,TimeUnit.SECONDS),f2.get(10,TimeUnit.SECONDS)));
        }
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM friend_request",Integer.class));
    }
    @Test void withdrawalBlocksActiveOwnerThenCleansRelationships()throws Exception{
        befriend();String id=trip();join(b,code(id)).andExpect(status().isCreated());
        mvc.perform(auth(delete("/api/v1/users/me"),a)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACTIVE_TRIP_OWNER"));
        mvc.perform(auth(patch("/api/v1/trips/"+id),a).contentType("application/json").content("{\"version\":0,\"status\":\"ARCHIVED\"}")).andExpect(status().isOk());
        mvc.perform(auth(delete("/api/v1/users/me"),a)).andExpect(status().isOk());
        assertFalse(users.existsById(Long.valueOf(a)));
        assertNull(db.queryForObject("SELECT owner_id FROM trip WHERE id=?",Long.class,id));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM api_idempotency WHERE user_id=?",Integer.class,a));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM friend_request",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM friendship",Integer.class));
        mvc.perform(auth(get("/api/v1/trips/"+id),b)).andExpect(status().isOk()).andExpect(jsonPath("$.data.owner.name").value("탈퇴한 사용자"));
    }
}
