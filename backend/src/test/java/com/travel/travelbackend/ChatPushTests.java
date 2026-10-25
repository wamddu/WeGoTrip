package com.travel.travelbackend;

import com.jayway.jsonpath.JsonPath;
import com.travel.travelbackend.entity.User;
import com.travel.travelbackend.repository.UserRepository;
import com.travel.travelbackend.tripapi.ChatService;
import com.travel.travelbackend.tripapi.CloudinaryImages;
import com.travel.travelbackend.notifications.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:chat-push;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.sql.init.schema-locations=classpath:trip-schema.sql,classpath:party-schema.sql,classpath:chat-schema.sql,classpath:push-schema.sql",
    "push.enabled=true","push.worker-enabled=false"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class ChatPushTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;
    @Autowired ChatService chat;
    @Autowired PushWorker worker;
    @Autowired PushFanout fanout;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean PushSender sender;
    @MockitoBean CloudinaryImages images;
    @MockitoBean Clock clock;
    @MockitoSpyBean ChatPushPolicy policy;
    String a,b,c,outsider,trip,path;
    long device;
    Instant now=Instant.parse("2026-10-25T00:00:00Z");
    @BeforeEach void setup() throws Exception {
        when(clock.instant()).thenReturn(now);when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        when(sender.available()).thenReturn(true);when(sender.send(any())).thenReturn(PushSender.Result.accepted());
        for(String table:List.of("push_delivery","push_event","chat_poll_vote","chat_poll_option","chat_poll","chat_message","chat_image_upload","itinerary_item","saved_place","trip_party_member","trip_party","api_rate_limit","api_idempotency","trip_invite_code","trip_invitation","trip_member","trip","friendship","friend_request","user_device","user_setting")) db.update("DELETE FROM "+table);
        users.deleteAll();
        a=user("a",true);b=user("b",true);c=user("c",false);outsider=user("outsider",true);
        trip=field(postAs("/api/v1/trips",a,UUID.randomUUID().toString(),Map.of("title","Trip","destination","Busan","startDate","2026-10-25","endDate","2026-10-27","budget",0,"inviteeIds",List.of())).andExpect(status().isCreated()),"trip.id");
        for(String member:List.of(b,c)) db.update("INSERT INTO trip_member(trip_id,user_id,joined_at) VALUES(?,?,?)",trip,member,Timestamp.from(now));
        path="/api/v1/trips/"+trip+"/chat";
        device=device(b,"token-b");device(a,"token-author");device(c,"token-disabled");device(outsider,"token-outsider");
    }
    String user(String name,boolean enabled) {
        String id=users.saveAndFlush(new User(name,name+"@example.invalid",null,now)).getId().toString();
        db.update("INSERT INTO user_setting(user_id,push_notification_enabled,location_sharing_enabled) VALUES(?,?,FALSE)",id,enabled);return id;
    }
    long device(String user,String token) {
        db.update("INSERT INTO user_device(user_id,fcm_token,device_type,created_at,last_active_at) VALUES(?,?,'ANDROID',?,?)",user,token,Timestamp.from(now),Timestamp.from(now));
        return db.queryForObject("SELECT id FROM user_device WHERE fcm_token=?",Long.class,token);
    }
    ResultActions postAs(String uri,String user,String key,Object body) throws Exception {
        return mvc.perform(post(uri).with(jwt().jwt(j->j.subject(user).claim("tokenVersion",0))).header("Idempotency-Key",key).contentType("application/json").content(json.writeValueAsString(body)));
    }
    String field(ResultActions result,String name) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.data."+name); }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class); }
    void send() throws Exception { postAs(path+"/messages",a,UUID.randomUUID().toString(),Map.of("text","private text must not be in push")).andExpect(status().isCreated()); }
    String state() { return db.queryForObject("SELECT status FROM push_delivery ORDER BY id LIMIT 1",String.class); }
    @Test void queuesOnlyEligibleDevicesOnceAndSendsGenericPayload() throws Exception {
        device(b,"token-b-second");
        String key=UUID.randomUUID().toString();var body=Map.of("text","secret message");
        postAs(path+"/messages",a,key,body).andExpect(status().isCreated());
        postAs(path+"/messages",a,key,body).andExpect(status().isCreated());
        assertEquals(1,count("chat_message"));assertEquals(1,count("push_event"));assertEquals(0,count("push_delivery"));
        var targets=json.readTree(db.queryForObject("SELECT targets_json FROM push_event",String.class));
        assertEquals(2,targets.size());assertFalse(targets.toString().contains("token-b"));
        verify(sender,never()).send(any());
        assertEquals(2,worker.drain());
        var payload=org.mockito.ArgumentCaptor.forClass(PushSender.Message.class);verify(sender,times(2)).send(payload.capture());
        assertEquals(Set.of("token-b","token-b-second"),new HashSet<>(payload.getAllValues().stream().map(PushSender.Message::token).toList()));
        for(var message:payload.getAllValues()) { assertEquals(b,message.data().get("recipientId"));assertEquals(trip,message.data().get("tripId"));assertEquals("",message.data().get("partyId"));assertFalse(message.body().contains("secret"));assertEquals("CHAT_MESSAGE",message.data().get("type")); }
        assertEquals(0,worker.drain());assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM push_delivery WHERE status='SENT'",Integer.class));
    }
    @Test void chatAndOutboxRollBackTogether() {
        var tx=new TransactionTemplate(manager);
        tx.executeWithoutResult(status->{
            chat.send(Jwt.withTokenValue("test").header("alg","none").subject(a).claim("tokenVersion",0).build(),trip,null,UUID.randomUUID().toString(),Map.of("text","rollback"));
            assertEquals(1,count("push_event"));assertEquals(0,count("push_delivery"));status.setRollbackOnly();
        });
        assertEquals(0,count("chat_message"));assertEquals(0,count("push_event"));assertEquals(0,count("push_delivery"));
    }
    @Test void partyImagesAndPollsNotifyMembersButPollUpdatesDoNot() throws Exception {
        db.update("UPDATE user_setting SET push_notification_enabled=TRUE WHERE user_id=?",c);
        String party=field(postAs("/api/v1/trips/"+trip+"/parties",a,UUID.randomUUID().toString(),Map.of("name","Party","memberIds",List.of(a,b))).andExpect(status().isCreated()),"id");
        String query="?partyId="+party;
        postAs(path+"/messages"+query,a,UUID.randomUUID().toString(),Map.of("text","party")).andExpect(status().isCreated());
        when(images.upload(any())).thenReturn(new CloudinaryImages.Uploaded("test-image","https://res.cloudinary.com/test/image/upload/test.jpg"));
        String upload=field(mvc.perform(multipart(path+"/images"+query).file(new MockMultipartFile("file","test.jpg","image/jpeg",new byte[]{1})).with(jwt().jwt(j->j.subject(a).claim("tokenVersion",0)))).andExpect(status().isCreated()),"id");
        postAs(path+"/messages"+query,a,UUID.randomUUID().toString(),Map.of("uploadId",upload)).andExpect(status().isCreated());
        var poll=postAs(path+"/polls"+query,a,UUID.randomUUID().toString(),Map.of("question","Where?","options",List.of(Map.of("label","A"),Map.of("label","B")))).andExpect(status().isCreated());
        mvc.perform(put(path+"/polls/"+field(poll,"poll.id")+"/vote"+query).with(jwt().jwt(j->j.subject(b).claim("tokenVersion",0))).contentType("application/json").content(json.writeValueAsString(Map.of("optionId",field(poll,"poll.options[0].id"))))).andExpect(status().isOk());
        assertEquals(3,count("push_event"));assertEquals(0,count("push_delivery"));
        assertEquals(3,worker.drain());
        verify(sender,times(3)).send(argThat(message->message.data().get("partyId").equals(party)&&message.data().get("recipientId").equals(b)));
    }
    @Test void changedSettingsMembershipAndTokensAreRecheckedBeforeSend() throws Exception {
        send();db.update("UPDATE user_setting SET push_notification_enabled=FALSE WHERE user_id=?",b);
        assertEquals(1,worker.drain());assertEquals("SKIPPED",state());verify(sender,never()).send(any());
        db.update("UPDATE user_setting SET push_notification_enabled=TRUE WHERE user_id=?",b);send();
        db.update("UPDATE user_device SET fcm_token='rotated' WHERE id=?",device);
        assertEquals(1,worker.drain());verify(sender,never()).send(any());
        send();db.update("DELETE FROM trip_member WHERE trip_id=? AND user_id=?",trip,b);
        assertEquals(1,worker.drain());verify(sender,never()).send(any());
    }
    @Test void partyRevocationSkipsQueuedPrivateNotification() throws Exception {
        String party=field(postAs("/api/v1/trips/"+trip+"/parties",a,UUID.randomUUID().toString(),Map.of("name","Party","memberIds",List.of(a,b))).andExpect(status().isCreated()),"id");
        postAs(path+"/messages?partyId="+party,a,UUID.randomUUID().toString(),Map.of("text","private")).andExpect(status().isCreated());
        db.update("DELETE FROM trip_party_member WHERE party_id=? AND trip_member_id IN (SELECT id FROM trip_member WHERE user_id=?)",party,b);
        assertEquals(1,worker.drain());assertEquals("SKIPPED",state());verify(sender,never()).send(any());
    }
    @Test void retryAndExpiredLeaseRecoverWithoutDuplicateQueueRows() throws Exception {
        send();when(sender.send(any())).thenReturn(new PushSender.Result(PushSender.Status.RETRY,"UNAVAILABLE",15),PushSender.Result.accepted());
        assertEquals(1,worker.drain());assertEquals("RETRY",state());assertEquals(0,worker.drain());
        when(clock.instant()).thenReturn(now.plusSeconds(16));assertEquals(1,worker.drain());assertEquals("SENT",state());
        assertEquals(1,count("push_delivery"));
        send();fanout.expandPending();db.update("UPDATE push_delivery SET status='SENDING',lease_token='lost-worker',lease_until=? WHERE status='PENDING'",Timestamp.from(now));
        assertEquals(1,worker.drain());verify(sender,times(3)).send(any());
    }
    @Test void concurrentWorkersClaimEachDeliveryOnlyOnce() throws Exception {
        send();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);Callable<Integer> action=()->{barrier.await();return worker.drain();};
            int count=0;for(var future:pool.invokeAll(List.of(action,action)))count+=future.get(10,TimeUnit.SECONDS);assertEquals(1,count);
        }
        verify(sender,times(1)).send(any());assertEquals("SENT",state());
    }
    @Test void snapshotExcludesLaterDevicesAndDoesNotExpandAgainAfterLogout() throws Exception {
        send();device(b,"registered-later");fanout.expandPending();
        assertEquals(1,count("push_delivery"));
        assertEquals("[]",db.queryForObject("SELECT targets_json FROM push_event",String.class));
        db.update("DELETE FROM user_device WHERE id=?",device);
        assertEquals(0,worker.drain());assertEquals(0,count("push_delivery"));
        send();fanout.expandPending();assertEquals(1,count("push_delivery"));
        assertEquals(1,worker.drain());verify(sender).send(argThat(message->message.token().equals("registered-later")));
        send();db.update("DELETE FROM user_device WHERE user_id=?",b);
        assertEquals(0,worker.drain());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM push_event WHERE expanded_at IS NULL",Integer.class));
    }
    @Test void concurrentChatAuthorsCommitBeforeRecipientForeignKeysAreAcquired() throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);var tasks=new ArrayList<Callable<Object>>();
            for(String actor:List.of(a,b)) tasks.add(()->{
                barrier.await();
                return chat.send(Jwt.withTokenValue("test").header("alg","none").subject(actor).claim("tokenVersion",0).build(),trip,null,UUID.randomUUID().toString(),Map.of("text","concurrent"));
            });
            for(var future:pool.invokeAll(tasks)) assertNotNull(future.get(10,TimeUnit.SECONDS));
        }
        assertEquals(2,count("chat_message"));assertEquals(2,count("push_event"));assertEquals(0,count("push_delivery"));
        assertEquals(2,worker.drain());verify(sender,times(2)).send(any());
    }
    @Test void disabledSenderWaitsAndExpiredNotificationsAreNotDelivered() throws Exception {
        send();when(sender.available()).thenReturn(false);assertEquals(0,worker.drain());assertEquals("PENDING",state());
        when(clock.instant()).thenReturn(now.plusSeconds(86401));when(sender.available()).thenReturn(true);
        assertEquals(1,worker.drain());assertEquals("EXPIRED",state());verify(sender,never()).send(any());
    }
    @Test void unregisteredDeviceIsRemovedButRotatedDeviceIsPreserved() throws Exception {
        send();when(sender.send(any())).thenAnswer(invocation->{db.update("UPDATE user_device SET fcm_token='new-token' WHERE id=?",device);return new PushSender.Result(PushSender.Status.INVALID_TOKEN,"UNREGISTERED",0);});
        assertEquals(1,worker.drain());assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM user_device WHERE id=?",Integer.class,device));
        send();when(sender.send(any())).thenReturn(new PushSender.Result(PushSender.Status.INVALID_TOKEN,"UNREGISTERED",0));
        assertEquals(1,worker.drain());assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM user_device WHERE id=?",Integer.class,device));
        assertEquals(3,count("user_device"));
    }
    @Test void policyFailureDoesNotBlockOtherDevicesAndRetryLimitStopsPermanentFailures() throws Exception {
        device(b,"second-device");send();
        doThrow(new IllegalStateException("temporary read failure")).doCallRealMethod().when(policy).resolve(anyLong(),anyString());
        assertEquals(2,worker.drain());verify(sender,times(1)).send(any());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM push_delivery WHERE status='RETRY' AND last_error_code='POLICY_ERROR'",Integer.class));
        db.update("UPDATE push_delivery SET attempts=6,next_attempt_at=? WHERE status='RETRY'",Timestamp.from(now));
        when(sender.send(any())).thenReturn(new PushSender.Result(PushSender.Status.RETRY,"UNAVAILABLE",15));
        assertEquals(1,worker.drain());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM push_delivery WHERE status='FAILED' AND attempts=7",Integer.class));
        assertEquals(0,worker.drain());
    }
}
