package com.travel.travelbackend;

import com.jayway.jsonpath.JsonPath;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import com.travel.travelbackend.tripapi.CloudinaryImages;
import com.travel.travelbackend.tripapi.ChatPollExpiry;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "spring.datasource.url=jdbc:h2:mem:chat-api;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.sql.init.schema-locations=classpath:trip-schema.sql,classpath:party-schema.sql,classpath:chat-schema.sql"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class ChatApiTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @MockitoBean CloudinaryImages images;
    @MockitoBean Clock clock;
    @Autowired ChatPollExpiry expiry;
    @LocalServerPort int port;
    String a,b,c,trip,path;
    @BeforeEach void setup() throws Exception {
        when(clock.instant()).thenAnswer(invocation->Instant.now());
        when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        for(String table:List.of("chat_poll_vote","chat_poll_option","chat_poll","chat_message","chat_image_upload","itinerary_item","saved_place","trip_party_member","trip_party","api_rate_limit","api_idempotency","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request")) db.update("DELETE FROM "+table);
        users.deleteAll();
        a=user("a"); b=user("b"); c=user("c"); trip=newTrip();
        db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,CURRENT_TIMESTAMP)",trip,b);
        path="/api/v1/trips/"+trip+"/chat";
        when(images.upload(any())).thenReturn(new CloudinaryImages.Uploaded("wegotrip/chat/test","https://res.cloudinary.com/test/image/upload/test.jpg"));
    }
    String user(String name) { return users.saveAndFlush(new User(name,name+"@example.invalid",null,Instant.now())).getId().toString(); }
    MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder request,String user) { return request.with(jwt().jwt(j->j.subject(user).claim("tokenVersion",0))); }
    org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder auth(org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder request,String user) { return request.with(jwt().jwt(j->j.subject(user).claim("tokenVersion",0))); }
    ResultActions create(String uri,String user,String key,Object body) throws Exception { return mvc.perform(auth(post(uri),user).header("Idempotency-Key",key).contentType("application/json").content(json.writeValueAsString(body))); }
    ResultActions create(String uri,String user,Object body) throws Exception { return create(uri,user,UUID.randomUUID().toString(),body); }
    ResultActions putBody(String uri,String user,Object body) throws Exception { return mvc.perform(auth(put(uri),user).contentType("application/json").content(json.writeValueAsString(body))); }
    <T> T field(ResultActions result,String name) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+name); }
    String newTrip() throws Exception { return field(create("/api/v1/trips",a,Map.of("title","Busan","destination","Busan","startDate","2026-10-24","endDate","2026-10-27","budget",0,"inviteeIds",List.of())).andExpect(status().isCreated()),"trip.id"); }
    String party(List<String> members) throws Exception { return field(create("/api/v1/trips/"+trip+"/parties",a,Map.of("name","Cafe team","memberIds",members)).andExpect(status().isCreated()),"id"); }
    String place(String tid) throws Exception { return field(create("/api/v1/trips/"+tid+"/saved-places",a,Map.of("name","Cafe","address","Busan","category","카페","note","")).andExpect(status().isCreated()),"id"); }
    Map<String,Object> poll(String place) {
        var first=new LinkedHashMap<String,Object>(); first.put("placeId",place); first.put("label","");
        return Map.of("question","어디로 갈까요?","options",List.of(first,Map.of("label","바다")));
    }
    Map<String,Object> timedPoll(String deadline) {
        return Map.of("question","언제 갈까요?","options",List.of(Map.of("label","아침"),Map.of("label","점심")),"closesAt",deadline);
    }
    Map<String,Object> multiplePoll() {
        return Map.of("question","어디로 갈까요?","allowMultiple",true,"options",List.of(Map.of("label","항목 1"),Map.of("label","항목 2"),Map.of("label","항목 3")));
    }

    @Test void multipleChoiceAddsOneVotePerOptionAndCountsDistinctParticipants() throws Exception {
        var created=create(path+"/polls",a,multiplePoll()).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.poll.allowMultiple").value(true)).andExpect(jsonPath("$.data.poll.myOptionIds.length()").value(0))
            .andExpect(jsonPath("$.data.poll.participantCount").value(0));
        String poll=field(created,"poll.id"), first=field(created,"poll.options[0].id"), second=field(created,"poll.options[1].id");
        String vote=path+"/polls/"+poll+"/vote";
        putBody(vote,b,Map.of("optionId",first,"selected",true)).andExpect(status().isOk());
        putBody(vote,b,Map.of("optionId",second,"selected",true)).andExpect(jsonPath("$.data.poll.myOptionIds.length()").value(2))
            .andExpect(jsonPath("$.data.poll.myOptionIds[0]").value(first)).andExpect(jsonPath("$.data.poll.myOptionIds[1]").value(second))
            .andExpect(jsonPath("$.data.poll.myOptionId").isEmpty()).andExpect(jsonPath("$.data.poll.participantCount").value(1))
            .andExpect(jsonPath("$.data.poll.options[0].votes").value(1)).andExpect(jsonPath("$.data.poll.options[1].votes").value(1));
        putBody(vote,b,Map.of("optionId",second,"selected",true)).andExpect(jsonPath("$.data.revision").value("2"));
        assertEquals(2,count("chat_poll_vote"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("INSERT INTO chat_poll_vote(poll_id,option_id,user_id) VALUES(?,?,?)",poll,first,b));
        putBody(vote,a,Map.of("optionId",second,"selected",true)).andExpect(jsonPath("$.data.poll.participantCount").value(2))
            .andExpect(jsonPath("$.data.poll.options[1].votes").value(2));
        putBody(vote,b,Map.of("optionId",first,"selected",false)).andExpect(jsonPath("$.data.poll.myOptionIds.length()").value(1))
            .andExpect(jsonPath("$.data.poll.myOptionIds[0]").value(second)).andExpect(jsonPath("$.data.poll.options[0].votes").value(0));
        putBody(vote,b,Map.of("optionId",first,"selected",false)).andExpect(jsonPath("$.data.revision").value("4"));
        putBody(vote,b,Map.of("optionId",second,"selected",false)).andExpect(jsonPath("$.data.poll.participantCount").value(1));
        putBody(vote,a,Map.of("optionId",second,"selected",false)).andExpect(jsonPath("$.data.poll.participantCount").value(0));
        assertEquals(0,count("chat_poll_vote"));
    }

    @Test void concurrentDifferentOptionSelectionsAndRetriesDoNotOverwriteEachOther() throws Exception {
        var created=create(path+"/polls",a,multiplePoll()).andExpect(status().isCreated());
        String poll=field(created,"poll.id"), first=field(created,"poll.options[0].id"), second=field(created,"poll.options[1].id"), third=field(created,"poll.options[2].id");
        String vote=path+"/polls/"+poll+"/vote";
        try(var pool=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);
            for(var future:pool.invokeAll(List.<Callable<Integer>>of(
                ()->{barrier.await();return putBody(vote,b,Map.of("optionId",first,"selected",true)).andReturn().getResponse().getStatus();},
                ()->{barrier.await();return putBody(vote,b,Map.of("optionId",second,"selected",true)).andReturn().getResponse().getStatus();}))) assertEquals(200,future.get(10,TimeUnit.SECONDS));
            Callable<Integer> repeat=()->{barrier.await();return putBody(vote,b,Map.of("optionId",first,"selected",true)).andReturn().getResponse().getStatus();};
            for(var future:pool.invokeAll(List.of(repeat,repeat))) assertEquals(200,future.get(10,TimeUnit.SECONDS));
            assertEquals(2,count("chat_poll_vote"));
            for(var future:pool.invokeAll(List.<Callable<Integer>>of(
                ()->{barrier.await();return putBody(vote,b,Map.of("optionId",first,"selected",false)).andReturn().getResponse().getStatus();},
                ()->{barrier.await();return putBody(vote,b,Map.of("optionId",third,"selected",true)).andReturn().getResponse().getStatus();}))) assertEquals(200,future.get(10,TimeUnit.SECONDS));
        }
        mvc.perform(auth(get(path+"/messages/"+field(created,"id")),b)).andExpect(jsonPath("$.data.revision").value("4"))
            .andExpect(jsonPath("$.data.poll.myOptionIds[0]").value(second)).andExpect(jsonPath("$.data.poll.myOptionIds[1]").value(third))
            .andExpect(jsonPath("$.data.poll.participantCount").value(1));
    }

    @Test void defaultSingleChoiceStillReplacesVotesAndRejectsInvalidMultipleRequests() throws Exception {
        var input=new HashMap<>(multiplePoll()); input.remove("allowMultiple");
        var created=create(path+"/polls",a,input).andExpect(status().isCreated()).andExpect(jsonPath("$.data.poll.allowMultiple").value(false));
        String poll=field(created,"poll.id"), first=field(created,"poll.options[0].id"), second=field(created,"poll.options[1].id");
        String vote=path+"/polls/"+poll+"/vote";
        putBody(vote,b,Map.of("optionId",first,"selected",true)).andExpect(status().isOk());
        putBody(vote,b,Map.of("optionId",second,"selected",true)).andExpect(jsonPath("$.data.poll.myOptionIds.length()").value(1));
        putBody(vote,b,Map.of("optionId",first,"selected",false)).andExpect(jsonPath("$.data.poll.myOptionId").value(second));
        putBody(vote,b,Map.of("optionId",first)).andExpect(jsonPath("$.data.poll.myOptionId").value(first));
        assertEquals(1,count("chat_poll_vote"));
        input.put("allowMultiple","true"); create(path+"/polls",a,input).andExpect(status().isBadRequest());
        input.put("allowMultiple",null); create(path+"/polls",a,input).andExpect(status().isBadRequest());
        var multi=create(path+"/polls",a,multiplePoll()).andExpect(status().isCreated());
        String multiVote=path+"/polls/"+field(multi,"poll.id")+"/vote", multiOption=field(multi,"poll.options[0].id");
        putBody(multiVote,b,Map.of("optionId",multiOption)).andExpect(status().isBadRequest());
        putBody(multiVote,b,Map.of("optionId",multiOption,"selected","true")).andExpect(status().isBadRequest());
        putBody(multiVote,b,Map.of("optionId",first,"selected",true)).andExpect(status().isBadRequest());
        var invalid=new HashMap<String,Object>(); invalid.put("optionId",null); invalid.put("selected",true);
        putBody(multiVote,b,invalid).andExpect(status().isBadRequest());
        putBody(multiVote,b,Map.of("optionId",multiOption,"selected",true,"allowMultiple",false)).andExpect(status().isBadRequest());
    }

    @Test void multipleChoiceCreationIsIdempotentAndModeCannotChangeOnRetry() throws Exception {
        String key=UUID.randomUUID().toString(); var body=multiplePoll();
        String message=field(create(path+"/polls",a,key,body).andExpect(status().isCreated()),"id");
        create(path+"/polls",a,key,body).andExpect(jsonPath("$.data.id").value(message)).andExpect(jsonPath("$.data.poll.allowMultiple").value(true));
        var changed=new HashMap<>(body); changed.put("allowMultiple",false);
        create(path+"/polls",a,key,changed).andExpect(status().isConflict());
        assertEquals(1,count("chat_poll"));
    }

    @Test void multipleChoiceKeepsPartyIsolationAndBlocksAddsAndRemovalsAtDeadline() throws Exception {
        Instant now=Instant.now(); when(clock.instant()).thenReturn(now);
        String party=party(List.of(a)), query="?partyId="+party;
        var body=new HashMap<>(multiplePoll()); body.put("closesAt",now.plusSeconds(60).toString());
        var created=create(path+"/polls"+query,a,body).andExpect(status().isCreated());
        String vote=path+"/polls/"+field(created,"poll.id")+"/vote"+query, first=field(created,"poll.options[0].id"), second=field(created,"poll.options[1].id");
        putBody(vote,b,Map.of("optionId",first,"selected",true)).andExpect(status().isNotFound());
        putBody(vote,c,Map.of("optionId",first,"selected",true)).andExpect(status().isNotFound());
        putBody(vote,a,Map.of("optionId",first,"selected",true)).andExpect(status().isOk());
        when(clock.instant()).thenReturn(now.plusSeconds(60));
        putBody(vote,a,Map.of("optionId",second,"selected",true)).andExpect(status().isConflict());
        putBody(vote,a,Map.of("optionId",first,"selected",false)).andExpect(status().isConflict());
        assertEquals(1,expiry.expireDue());
        mvc.perform(auth(get(path+"/messages/"+field(created,"id")+query),a)).andExpect(jsonPath("$.data.poll.closed").value(true))
            .andExpect(jsonPath("$.data.poll.participantCount").value(1)).andExpect(jsonPath("$.data.poll.myOptionIds[0]").value(first));
    }

    @Test void timedPollChecksExactDeadlineBeforeSchedulerAndRetainsExistingVote() throws Exception {
        Instant now=Instant.parse("2026-10-24T00:00:00Z"), deadline=now.plusSeconds(600);
        when(clock.instant()).thenReturn(now);
        var result=create(path+"/polls",a,timedPoll("2026-10-24T09:10:00+09:00")).andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.poll.closesAt").value(deadline.toString())).andExpect(jsonPath("$.data.poll.serverNow").value(now.toString()));
        String poll=field(result,"poll.id"), message=field(result,"id"), first=field(result,"poll.options[0].id"), second=field(result,"poll.options[1].id");
        when(clock.instant()).thenReturn(deadline.minusNanos(1000));
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",first)).andExpect(status().isOk());
        when(clock.instant()).thenReturn(deadline);
        for(Object option:List.of(first,second))
            putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",option)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("POLL_CLOSED"));
        var cancel=new HashMap<String,Object>(); cancel.put("optionId",null);
        putBody(path+"/polls/"+poll+"/vote",b,cancel).andExpect(status().isConflict());
        mvc.perform(auth(get(path+"/messages/"+message),b)).andExpect(jsonPath("$.data.poll.closed").value(true))
            .andExpect(jsonPath("$.data.poll.myOptionId").value(first)).andExpect(jsonPath("$.data.poll.options[0].votes").value(1));
        assertFalse(db.queryForObject("SELECT closed FROM chat_poll WHERE id=?",Boolean.class,poll));
        assertEquals(1,expiry.expireDue());
        assertEquals(0,expiry.expireDue());
        assertTrue(db.queryForObject("SELECT closed FROM chat_poll WHERE id=?",Boolean.class,poll));
        mvc.perform(auth(get(path+"/messages/"+message),a)).andExpect(jsonPath("$.data.revision").value("2"));
        when(clock.instant()).thenReturn(deadline.plusSeconds(86400));
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",first)).andExpect(status().isConflict());
    }

    @Test void deadlinesRejectInvalidPastAndUnsupportedValuesButKeepUntimedCompatibility() throws Exception {
        Instant now=Instant.parse("2026-10-24T00:00:00Z");
        when(clock.instant()).thenReturn(now);
        for(Object value:List.of("",now.toString(),now.minusSeconds(1).toString(),"2026-10-24T01:00:00","2026-02-30T10:00:00Z","2039-01-01T00:00:00Z",123)) {
            var body=new HashMap<>(timedPoll(now.plusSeconds(600).toString())); body.put("closesAt",value);
            create(path+"/polls",a,body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_POLL_DEADLINE"));
        }
        var body=new HashMap<>(timedPoll(now.plusSeconds(600).toString())); body.put("closesAt",null);
        create(path+"/polls",a,body).andExpect(status().isCreated()).andExpect(jsonPath("$.data.poll.closesAt").isEmpty());
        body.remove("closesAt");
        var result=create(path+"/polls",a,body).andExpect(status().isCreated());
        when(clock.instant()).thenReturn(now.plusSeconds(365*86400));
        assertEquals(0,expiry.expireDue());
        mvc.perform(auth(get(path+"/messages/"+field(result,"id")),a)).andExpect(jsonPath("$.data.poll.closed").value(false));
        assertEquals(2,count("chat_poll"));
    }

    @Test void timedPollCreationRetriesAfterExpiryKeepIdentityAndCurrentState() throws Exception {
        Instant now=Instant.parse("2026-10-24T00:00:00Z"), deadline=now.plusSeconds(60);
        when(clock.instant()).thenReturn(now);
        String key=UUID.randomUUID().toString(); var body=timedPoll(deadline.toString());
        String message=field(create(path+"/polls",a,key,body).andExpect(status().isCreated()),"id");
        when(clock.instant()).thenReturn(deadline.plusSeconds(1));
        create(path+"/polls",a,key,body).andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").value(message))
            .andExpect(jsonPath("$.data.poll.closed").value(true)).andExpect(jsonPath("$.data.poll.serverNow").value(deadline.plusSeconds(1).toString()));
        create(path+"/polls",a,key,timedPoll(deadline.plusSeconds(600).toString())).andExpect(status().isConflict());
        assertEquals(1,count("chat_poll"));
    }

    @Test void manualClosureBeforeDeadlineAndConcurrentExpiryOnlyAdvanceRevisionOnce() throws Exception {
        Instant now=Instant.parse("2026-10-24T00:00:00Z"), deadline=now.plusSeconds(60);
        when(clock.instant()).thenReturn(now);
        var first=create(path+"/polls",b,timedPoll(deadline.toString())).andExpect(status().isCreated());
        String early=field(first,"poll.id"), earlyMessage=field(first,"id");
        putBody(path+"/polls/"+early+"/closure",a,Map.of("closed",true)).andExpect(status().isOk());
        putBody(path+"/polls/"+early+"/closure",a,Map.of("closed",true)).andExpect(jsonPath("$.data.revision").value("1"));
        var second=create(path+"/polls",b,timedPoll(deadline.toString())).andExpect(status().isCreated());
        String message=field(second,"id");
        when(clock.instant()).thenReturn(deadline.plusSeconds(3600));
        try(var pool=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);
            Callable<Integer> expire=()->{barrier.await();return expiry.expireDue();};
            int total=0; for(var future:pool.invokeAll(List.of(expire,expire))) total+=future.get(10,TimeUnit.SECONDS);
            assertEquals(1,total);
        }
        mvc.perform(auth(get(path+"/messages/"+message),a)).andExpect(jsonPath("$.data.revision").value("1"));
        mvc.perform(auth(get(path+"/messages/"+earlyMessage),a)).andExpect(jsonPath("$.data.revision").value("1"));
    }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }
    String imageMessage(String who,String partyId,String text) throws Exception {
        String query=partyId==null?"":"?partyId="+partyId;
        when(images.upload(any())).thenReturn(new CloudinaryImages.Uploaded("wegotrip/chat/"+UUID.randomUUID(),"https://res.cloudinary.com/test/image/upload/test.jpg"));
        String upload=field(mvc.perform(auth(multipart(path+"/images"+query).file(new MockMultipartFile("file","test.jpg","image/jpeg",new byte[]{1})),who)).andExpect(status().isCreated()),"id");
        return field(create(path+"/messages"+query,who,Map.of("text",text,"uploadId",upload)).andExpect(status().isCreated()),"id");
    }

    @Test void imageFilterPaginatesImagesAcrossTextHistoryAndKeepsPartyAccessIsolated() throws Exception {
        String older=imageMessage(a,null,"사진 설명도 함께 보여요");
        for(int i=0;i<55;i++) db.update("INSERT INTO chat_message(trip_id,author_id,kind,text,created_at) VALUES(?,?,'TEXT','text',CURRENT_TIMESTAMP)",trip,a);
        create(path+"/polls",a,poll(place(trip))).andExpect(status().isCreated());
        String newer=imageMessage(b,null,"최근 사진");
        String party=party(List.of(a)), privateImage=imageMessage(a,party,"파티 사진");
        var first=mvc.perform(auth(get(path+"/messages?imagesOnly=true&limit=1"),a)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.items[0].id").value(newer))
            .andExpect(jsonPath("$.data.items[0].kind").value("IMAGE"));
        String cursor=field(first,"nextCursor");
        mvc.perform(auth(get(path+"/messages?imagesOnly=true&limit=1&before="+cursor),a)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.items[0].id").value(older))
            .andExpect(jsonPath("$.data.items[0].text").value("사진 설명도 함께 보여요")).andExpect(jsonPath("$.data.nextCursor").isEmpty());
        mvc.perform(auth(get(path+"/messages?imagesOnly=true&partyId="+party),a)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.items[0].id").value(privateImage));
        mvc.perform(auth(get(path+"/messages?imagesOnly=true&partyId="+party),b)).andExpect(status().isNotFound());
        mvc.perform(auth(get(path+"/messages?imagesOnly=true"),c)).andExpect(status().isNotFound());
        mvc.perform(auth(get(path+"/messages?imagesOnly=false&limit=100"),a)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(58));
        String other=newTrip();
        mvc.perform(auth(get("/api/v1/trips/"+other+"/chat/messages?imagesOnly=true"),a)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(0));
    }

    @Test void sharedMessagesAreIdempotentAndHistoryUsesStableBigintCursors() throws Exception {
        String key=UUID.randomUUID().toString();
        String id=field(create(path+"/messages",a,key,Map.of("text"," 첫 인사 ")).andExpect(status().isCreated()),"id");
        create(path+"/messages",a,key,Map.of("text","첫 인사")).andExpect(jsonPath("$.data.id").value(id));
        assertEquals(1,count("chat_message"));
        create(path+"/messages",a,key,Map.of("text","다른 내용")).andExpect(status().isConflict());
        create(path+"/messages",b,Map.of("text","두 번째")).andExpect(status().isCreated());
        create(path+"/messages",a,Map.of("text","세 번째")).andExpect(status().isCreated());
        var page=mvc.perform(auth(get(path+"/messages?limit=2"),b)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.data.items.length()").value(2)).andExpect(jsonPath("$.data.items[0].text").value("두 번째"));
        String cursor=field(page,"nextCursor");
        mvc.perform(auth(get(path+"/messages?limit=2&before="+cursor),b)).andExpect(jsonPath("$.data.items.length()").value(1)).andExpect(jsonPath("$.data.items[0].id").value(id)).andExpect(jsonPath("$.data.nextCursor").isEmpty());
        mvc.perform(get(path+"/messages")).andExpect(status().isUnauthorized());
        mvc.perform(auth(get(path+"/messages"),c)).andExpect(status().isNotFound());
        create(path+"/messages",a,Map.of("text"," ")).andExpect(status().isBadRequest());
        create(path+"/messages",a,Map.of("text","x","authorId",b)).andExpect(status().isBadRequest());
    }
    @Test void partyChatIsPrivateEvenFromTheTripOwnerAndChecksEveryOperation() throws Exception {
        String party=party(List.of(b)), query="?partyId="+party;
        String message=field(create(path+"/messages"+query,b,Map.of("text","파티만")).andExpect(status().isCreated()),"id");
        for(String uri:List.of(path+"/messages"+query,path+"/messages/"+message+query)) mvc.perform(auth(get(uri),a)).andExpect(status().isNotFound());
        create(path+"/messages"+query,a,Map.of("text","안 됨")).andExpect(status().isNotFound());
        create(path+"/polls"+query,a,poll(place(trip))).andExpect(status().isNotFound());
        mvc.perform(auth(multipart(path+"/images"+query).file(new MockMultipartFile("file","test.jpg","image/jpeg",new byte[]{1})),a)).andExpect(status().isNotFound());
        verify(images,never()).upload(any());
        mvc.perform(auth(get(path+"/messages"),b)).andExpect(jsonPath("$.data.items.length()").value(0));
        db.update("DELETE FROM trip_party_member WHERE party_id=?",party);
        mvc.perform(auth(get(path+"/messages"+query),b)).andExpect(status().isNotFound());
    }
    @Test void pollsConnectOnlySameTripPlacesReplaceVotesAndPreserveDeletedPlaceSnapshots() throws Exception {
        String place=place(trip), other=place(newTrip());
        create(path+"/polls",a,poll(other)).andExpect(status().isNotFound());
        var result=create(path+"/polls",a,poll(place)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.poll.options[0].placeName").value("Cafe"));
        String poll=field(result,"poll.id"), message=field(result,"id"), first=field(result,"poll.options[0].id"), second=field(result,"poll.options[1].id");
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",first)).andExpect(jsonPath("$.data.poll.myOptionId").value(first));
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",second)).andExpect(jsonPath("$.data.poll.options[0].votes").value(0)).andExpect(jsonPath("$.data.poll.options[1].votes").value(1));
        assertEquals(1,count("chat_poll_vote"));
        var cancel=new LinkedHashMap<String,Object>(); cancel.put("optionId",null);
        putBody(path+"/polls/"+poll+"/vote",b,cancel).andExpect(jsonPath("$.data.poll.myOptionId").isEmpty());
        putBody(path+"/polls/"+poll+"/closure",b,Map.of("closed",true)).andExpect(status().isForbidden());
        mvc.perform(auth(delete("/api/v1/trips/"+trip+"/saved-places/"+place),a)).andExpect(status().isOk());
        mvc.perform(auth(get(path+"/messages/"+message),a)).andExpect(jsonPath("$.data.poll.options[0].placeId").isEmpty()).andExpect(jsonPath("$.data.poll.options[0].placeName").value("Cafe"));
        putBody(path+"/polls/"+poll+"/closure",a,Map.of("closed",true)).andExpect(jsonPath("$.data.poll.closed").value(true));
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",first)).andExpect(status().isConflict());
        putBody(path+"/polls/"+poll+"/closure",a,Map.of("closed",false)).andExpect(status().isBadRequest());
    }
    @Test void imagesAreStoredAsTrustedUrlsAndBoundToUploaderAndChannel() throws Exception {
        var upload=mvc.perform(auth(multipart(path+"/images").file(new MockMultipartFile("file","test.jpg","image/jpeg",new byte[]{1})),a)).andExpect(status().isCreated());
        String id=field(upload,"id");
        create(path+"/messages",b,Map.of("uploadId",id)).andExpect(status().isBadRequest());
        create(path+"/messages?partyId="+party(List.of(a)),a,Map.of("uploadId",id)).andExpect(status().isBadRequest());
        create(path+"/messages",a,Map.of("uploadId",id)).andExpect(status().isCreated()).andExpect(jsonPath("$.data.kind").value("IMAGE")).andExpect(jsonPath("$.data.imageUrl").value("https://res.cloudinary.com/test/image/upload/test.jpg"));
        create(path+"/messages",a,Map.of("uploadId",id)).andExpect(status().isBadRequest());
        create(path+"/messages",a,Map.of("imageUrl","https://untrusted.invalid/x")).andExpect(status().isBadRequest());
        assertEquals(1,count("chat_message"));
        var actual=new CloudinaryImages("test","key","secret",json,Clock.systemUTC());
        assertThrows(com.travel.travelbackend.userapi.ApiException.class,()->actual.upload(new MockMultipartFile("file","fake.jpg","image/jpeg","not an image".getBytes())));
    }
    @Test void archivedTripsAllowHistoryButRejectMessagesUploadsVotesAndNewPolls() throws Exception {
        String place=place(trip);
        var created=create(path+"/polls",a,poll(place)).andExpect(status().isCreated());
        String poll=field(created,"poll.id"), option=field(created,"poll.options[0].id");
        db.update("UPDATE trip SET status='ARCHIVED' WHERE id=?",trip);
        mvc.perform(auth(get(path+"/messages"),b)).andExpect(status().isOk());
        create(path+"/messages",a,Map.of("text","x")).andExpect(status().isConflict());
        create(path+"/polls",a,poll(place)).andExpect(status().isConflict());
        putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",option)).andExpect(status().isConflict());
        mvc.perform(auth(multipart(path+"/images").file(new MockMultipartFile("file","x.jpg","image/jpeg",new byte[]{1})),a)).andExpect(status().isConflict());
        verify(images,never()).upload(any());
    }
    @Test void concurrentRetriesCreateOneMessageAndConcurrentVotesRemainOnePerUser() throws Exception {
        String key=UUID.randomUUID().toString();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CyclicBarrier(2);
            Callable<Integer> send=()->{ start.await(5,TimeUnit.SECONDS); return create(path+"/messages",a,key,Map.of("text","same")).andReturn().getResponse().getStatus(); };
            var calls=pool.invokeAll(List.of(send,send));
            for(var call:calls) assertEquals(201,call.get(10,TimeUnit.SECONDS));
        }
        assertEquals(1,count("chat_message"));
        var result=create(path+"/polls",a,poll(place(trip))).andExpect(status().isCreated());
        String poll=field(result,"poll.id"), first=field(result,"poll.options[0].id"),second=field(result,"poll.options[1].id");
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CyclicBarrier(2);
            List<Callable<Integer>> votes=List.of(()->{start.await(); return putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",first)).andReturn().getResponse().getStatus();},()->{start.await(); return putBody(path+"/polls/"+poll+"/vote",b,Map.of("optionId",second)).andReturn().getResponse().getStatus();});
            for(var call:pool.invokeAll(votes)) assertEquals(200,call.get(10,TimeUnit.SECONDS));
        }
        assertEquals(1,count("chat_poll_vote"));
    }

    static class Frames implements WebSocket.Listener {
        final BlockingQueue<String> frames=new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed=new CompletableFuture<>();
        final StringBuilder parts=new StringBuilder();
        public void onOpen(WebSocket socket) { socket.request(1); }
        public CompletionStage<?> onText(WebSocket socket,CharSequence data,boolean last) {
            parts.append(data); if(last) { frames.add(parts.toString()); parts.setLength(0); }
            socket.request(1); return null;
        }
        public CompletionStage<?> onClose(WebSocket socket,int status,String reason) { closed.complete(status); return null; }
        String next(String type) throws Exception {
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
            while(System.nanoTime()<until) { String frame=frames.poll(100,TimeUnit.MILLISECONDS); if(frame!=null && frame.contains("\"type\":\""+type+"\"")) return frame; }
            fail("Missing socket frame: "+type); return null;
        }
    }
    String token(String user,Instant expiry) throws Exception {
        var encoder=Base64.getUrlEncoder().withoutPadding();
        String header=encoder.encodeToString("{\"alg\":\"HS256\"}".getBytes(StandardCharsets.UTF_8));
        String payload=encoder.encodeToString(json.writeValueAsBytes(Map.of("sub",user,"iss","wegotrip-auth","aud",List.of("wegotrip-api"),"iat",Instant.now().minusSeconds(10).getEpochSecond(),"exp",expiry.getEpochSecond(),"tokenVersion",0)));
        String input=header+"."+payload;
        var mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return input+"."+encoder.encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
    }
    WebSocket subscribe(String token,String party,Frames listener) throws Exception {
        var socket=HttpClient.newHttpClient().newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5)).buildAsync(URI.create("ws://localhost:"+port+"/ws/chat"),listener).get(5,TimeUnit.SECONDS);
        var body=new LinkedHashMap<String,Object>(); body.put("type","subscribe"); body.put("token",token); body.put("tripId",trip); body.put("partyId",party);
        socket.sendText(json.writeValueAsString(body),true).get(5,TimeUnit.SECONDS); return socket;
    }
    @Test void realSocketNotifiesAfterCommitAndRevokesPartyMembership() throws Exception {
        String party=party(List.of(a,b));
        var frames=new Frames(); var global=new Frames();
        var socket=subscribe(token(b,Instant.now().plusSeconds(120)),party,frames);
        var all=subscribe(token(b,Instant.now().plusSeconds(120)),null,global);
        try {
            frames.next("ready"); global.next("ready");
            String id=field(create(path+"/messages?partyId="+party,a,Map.of("text","live")).andExpect(status().isCreated()),"id");
            assertTrue(frames.next("changed").contains(id));
            String sharedId=field(create(path+"/messages",a,Map.of("text","whole trip")).andExpect(status().isCreated()),"id");
            assertTrue(global.next("changed").contains("\"messageId\":\""+sharedId+"\""));
            db.update("DELETE FROM trip_party_member WHERE party_id=? AND trip_member_id IN (SELECT id FROM trip_member WHERE user_id=?)",party,b);
            create(path+"/messages?partyId="+party,a,Map.of("text","private")).andExpect(status().isCreated());
            assertEquals(1008,frames.closed.get(5,TimeUnit.SECONDS));
            db.update("UPDATE `user` SET token_version=1 WHERE id=?",b);
            create(path+"/messages",a,Map.of("text","revoked token")).andExpect(status().isCreated());
            assertEquals(1008,global.closed.get(5,TimeUnit.SECONDS));
        } finally { socket.abort(); all.abort(); }
        var outsider=new Frames(); var denied=subscribe(token(c,Instant.now().plusSeconds(120)),null,outsider);
        try { assertEquals(1008,outsider.closed.get(5,TimeUnit.SECONDS)); } finally { denied.abort(); }
        var expired=new Frames(); var invalid=subscribe(token(a,Instant.now().minusSeconds(1)),null,expired);
        try { assertEquals(1008,expired.closed.get(5,TimeUnit.SECONDS)); } finally { invalid.abort(); }
    }
    @Test void automaticDeadlineBroadcastsOnlyToItsPartyAfterCommit() throws Exception {
        Instant now=Instant.now(); when(clock.instant()).thenReturn(now);
        String party=party(List.of(a,b));
        var privateFrames=new Frames(); var globalFrames=new Frames();
        var privateSocket=subscribe(token(b,Instant.now().plusSeconds(120)),party,privateFrames);
        var globalSocket=subscribe(token(b,Instant.now().plusSeconds(120)),null,globalFrames);
        try {
            privateFrames.next("ready"); globalFrames.next("ready");
            var created=create(path+"/polls?partyId="+party,a,timedPoll(now.plusSeconds(600).toString())).andExpect(status().isCreated());
            String message=field(created,"id");
            privateFrames.next("changed");
            when(clock.instant()).thenReturn(now.plusSeconds(601));
            assertEquals(1,expiry.expireDue());
            assertTrue(privateFrames.next("changed").contains("\"messageId\":\""+message+"\""));
            assertTrue(globalFrames.frames.stream().noneMatch(frame->frame.contains("\"type\":\"changed\"")));
            mvc.perform(auth(get(path+"/messages/"+message+"?partyId="+party),b))
                .andExpect(jsonPath("$.data.poll.closed").value(true)).andExpect(jsonPath("$.data.revision").value("1"));
            mvc.perform(auth(get(path+"/messages/"+message),b)).andExpect(status().isNotFound());
            assertEquals(0,expiry.expireDue());
        } finally { privateSocket.abort(); globalSocket.abort(); }
    }
    @Test void socketsRejectUnlistedWebOrigins() {
        var listener=new Frames();
        var future=HttpClient.newHttpClient().newWebSocketBuilder().header("Origin","https://untrusted.invalid")
            .buildAsync(URI.create("ws://localhost:"+port+"/ws/chat"),listener);
        assertThrows(ExecutionException.class,()->future.get(5,TimeUnit.SECONDS));
    }
}
