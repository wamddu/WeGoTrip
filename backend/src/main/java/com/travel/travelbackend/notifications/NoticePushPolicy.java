package com.travel.travelbackend.notifications;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Component
public class NoticePushPolicy implements PushPolicy {
    private final JdbcTemplate db;
    private final Clock clock;
    public NoticePushPolicy(JdbcTemplate db,Clock clock) { this.db=db;this.clock=clock; }
    public String type() { return "TRIP_NOTICE"; }
    public Optional<PushSender.Message> resolve(long deliveryId,String leaseToken) {
        var rows=db.queryForList("SELECT d.recipient_id,d.token_hash,e.id AS event_id,e.trip_id,e.source_id,e.expires_at,ud.fcm_token FROM push_delivery d JOIN push_event e ON e.id=d.event_id JOIN user_device ud ON ud.id=d.device_id AND ud.user_id=d.recipient_id JOIN `user` u ON u.id=d.recipient_id JOIN user_setting us ON us.user_id=u.id JOIN trip t ON t.id=e.trip_id JOIN trip_member tm ON tm.trip_id=t.id AND tm.user_id=u.id JOIN trip_notice n ON n.id=e.source_id AND n.trip_id=t.id AND n.author_id=e.actor_id WHERE d.id=? AND d.lease_token=? AND d.status='SENDING' AND e.event_type='TRIP_NOTICE' AND e.party_id IS NULL AND e.actor_id<>u.id AND u.status='ACTIVE' AND us.push_notification_enabled=TRUE AND tm.notification_enabled=TRUE AND t.status='ACTIVE' AND e.expires_at>?",deliveryId,leaseToken,Timestamp.from(clock.instant()));
        if(rows.isEmpty())return Optional.empty();var row=rows.getFirst();String token=(String)row.get("fcm_token");
        if(!PushQueue.hash(token).equals(row.get("token_hash")))return Optional.empty();
        long ttl=Duration.between(clock.instant(),((Timestamp)row.get("expires_at")).toInstant()).toMillis();if(ttl<=0)return Optional.empty();
        var data=Map.of("type",type(),"recipientId",row.get("recipient_id").toString(),"tripId",row.get("trip_id").toString(),"noticeId",row.get("source_id").toString(),"eventId",row.get("event_id").toString(),"deliveryId",Long.toString(deliveryId));
        return Optional.of(new PushSender.Message(token,"새 여행 공지","참여 중인 여행에 새 공지가 등록됐어요.",data,ttl));
    }
}
