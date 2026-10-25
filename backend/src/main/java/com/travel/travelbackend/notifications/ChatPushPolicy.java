package com.travel.travelbackend.notifications;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.*;

@Component
public class ChatPushPolicy implements PushPolicy {
    private final JdbcTemplate db;
    private final Clock clock;
    public ChatPushPolicy(JdbcTemplate db, Clock clock) { this.db=db;this.clock=clock; }
    public String type() { return "CHAT_MESSAGE"; }
    public Optional<PushSender.Message> resolve(long deliveryId,String leaseToken) {
        var rows=db.queryForList("SELECT d.id,d.recipient_id,d.token_hash,e.id AS event_id,e.trip_id,e.party_id,e.source_id,e.expires_at,ud.fcm_token FROM push_delivery d JOIN push_event e ON e.id=d.event_id JOIN user_device ud ON ud.id=d.device_id AND ud.user_id=d.recipient_id JOIN `user` u ON u.id=d.recipient_id JOIN user_setting us ON us.user_id=u.id JOIN trip t ON t.id=e.trip_id JOIN trip_member tm ON tm.trip_id=t.id AND tm.user_id=u.id JOIN chat_message m ON m.id=e.source_id AND m.trip_id=t.id AND (m.party_id=e.party_id OR (m.party_id IS NULL AND e.party_id IS NULL)) WHERE d.id=? AND d.lease_token=? AND d.status='SENDING' AND e.event_type='CHAT_MESSAGE' AND u.status='ACTIVE' AND us.push_notification_enabled=TRUE AND t.status='ACTIVE' AND e.actor_id<>u.id AND m.author_id=e.actor_id AND e.expires_at>? AND (e.party_id IS NULL OR EXISTS(SELECT 1 FROM trip_party_member pm JOIN trip_party tp ON tp.id=pm.party_id WHERE pm.trip_member_id=tm.id AND pm.party_id=e.party_id AND tp.trip_id=t.id))",deliveryId,leaseToken,Timestamp.from(clock.instant()));
        if(rows.isEmpty()) return Optional.empty();
        var row=rows.getFirst(); String token=(String)row.get("fcm_token");
        if(!PushQueue.hash(token).equals(row.get("token_hash"))) return Optional.empty();
        var data=new LinkedHashMap<String,String>();
        data.put("type",type());data.put("recipientId",row.get("recipient_id").toString());
        data.put("tripId",row.get("trip_id").toString());data.put("partyId",Objects.toString(row.get("party_id"),""));
        data.put("messageId",row.get("source_id").toString());data.put("eventId",row.get("event_id").toString());
        data.put("deliveryId",Long.toString(deliveryId));
        long ttl=Duration.between(clock.instant(),((Timestamp)row.get("expires_at")).toInstant()).toMillis();
        if(ttl<=0) return Optional.empty();
        return Optional.of(new PushSender.Message(token,"새 채팅 메시지","참여 중인 여행 채팅에 새 메시지가 도착했어요.",Map.copyOf(data),ttl));
    }
}
