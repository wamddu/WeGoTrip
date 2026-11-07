package com.travel.travelbackend.notifications;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.*;
import com.google.firebase.messaging.*;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.file.*;

@Component
public class FcmPushSender implements PushSender {
    private static final Logger log=LoggerFactory.getLogger(FcmPushSender.class);
    private final FirebaseApp app;
    public FcmPushSender(@Value("${push.enabled:false}") boolean enabled,
        @Value("${push.firebase-project-id:}") String project,
        @Value("${push.credentials-file:}") String credentialsFile) {
        FirebaseApp configured=null;
        if(enabled && !project.isBlank()) {
            try {
                GoogleCredentials credentials;
                if(credentialsFile.isBlank()) credentials=GoogleCredentials.getApplicationDefault();
                else try(var input=Files.newInputStream(Path.of(credentialsFile))) { credentials=GoogleCredentials.fromStream(input); }
                var options=FirebaseOptions.builder().setCredentials(credentials).setProjectId(project)
                    .setConnectTimeout(5000).setReadTimeout(15000).build();
                configured=FirebaseApp.initializeApp(options,"wegotrip-push");
                log.info("Firebase push sender configured for project {}",project);
            } catch(Exception error) { log.warn("Push sender is unavailable: verify Firebase server credentials and project configuration."); }
        } else if(enabled) log.warn("Push delivery is waiting for FIREBASE_PROJECT_ID.");
        app=configured;
    }
    public boolean available() { return app!=null; }
    public Result send(PushSender.Message message) {
        if(app==null) return new Result(Status.RETRY,"SENDER_UNAVAILABLE",60);
        try {
            FirebaseMessaging.getInstance(app).send(request(message));
            return Result.accepted();
        } catch(FirebaseMessagingException error) {
            var code=error.getMessagingErrorCode();
            String name=code==null?"FCM_ERROR":code.name();
            if(code==MessagingErrorCode.UNREGISTERED) return new Result(Status.INVALID_TOKEN,name,0);
            if(code==MessagingErrorCode.INVALID_ARGUMENT || code==MessagingErrorCode.SENDER_ID_MISMATCH) return new Result(Status.FAILED,name,0);
            return new Result(Status.RETRY,name,code==MessagingErrorCode.QUOTA_EXCEEDED?60:15);
        }
    }
    static com.google.firebase.messaging.Message request(PushSender.Message message) {
        var data=message.data();
        String tag="TRIP_NOTICE".equals(data.get("type"))
            ?"notice-"+data.get("recipientId")+"-"+data.get("noticeId")
            :"chat-"+data.get("recipientId")+"-"+data.get("tripId")+"-"+(data.get("partyId").isEmpty()?"all":data.get("partyId"));
        var android=AndroidConfig.builder().setPriority(AndroidConfig.Priority.HIGH).setTtl(message.ttlMillis())
            .setNotification(AndroidNotification.builder().setChannelId("default").setSound("default").setTag(tag).build()).build();
        return com.google.firebase.messaging.Message.builder().setToken(message.token())
            .setNotification(Notification.builder().setTitle(message.title()).setBody(message.body()).build())
            .putAllData(data).setAndroidConfig(android)
            .setApnsConfig(ApnsConfig.builder().putHeader("apns-expiration",Long.toString((System.currentTimeMillis()+message.ttlMillis())/1000))
                .setAps(Aps.builder().setSound("default").setThreadId(tag).build()).build())
            .setWebpushConfig(WebpushConfig.builder().putHeader("TTL",Long.toString(Math.max(1,message.ttlMillis()/1000)))
                .setNotification(WebpushNotification.builder().setTag(tag).build()).build()).build();
    }
    @PreDestroy public void close() { if(app!=null) app.delete(); }
}
