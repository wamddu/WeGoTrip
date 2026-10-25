package com.travel.travelbackend.notifications;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Objects;

@Service
public class PushQueue {
    private final JdbcTemplate db;
    private final Clock clock;
    private final ObjectMapper json;
    private final boolean enabled;
    private final long ttlSeconds;
    public record Target(long recipientId,long deviceId,String tokenHash) {}
    public PushQueue(JdbcTemplate db, Clock clock, ObjectMapper json, @Value("${push.enabled:false}") boolean enabled,
        @Value("${push.ttl-seconds:86400}") long ttlSeconds) {
        this.db=db;this.clock=clock;this.json=json;this.enabled=enabled;this.ttlSeconds=Math.clamp(ttlSeconds,60,2419200);
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void chat(long trip, Long party, long actor, long message) {
        enqueue("CHAT_MESSAGE",trip,party,actor,message,false);
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void notice(long trip,long actor,long notice) {
        enqueue("TRIP_NOTICE",trip,null,actor,notice,true);
    }
    private void enqueue(String type,long trip,Long party,long actor,long source,boolean tripPreference) {
        if(!enabled) return;
        String preference=tripPreference?" AND tm.notification_enabled=TRUE":"";
        var devices=db.queryForList("SELECT d.id,d.user_id,d.fcm_token FROM user_device d JOIN `user` u ON u.id=d.user_id JOIN user_setting us ON us.user_id=d.user_id JOIN trip_member tm ON tm.user_id=d.user_id AND tm.trip_id=? WHERE d.user_id<>? AND u.status='ACTIVE' AND us.push_notification_enabled=TRUE"+preference+" AND (? IS NULL OR EXISTS(SELECT 1 FROM trip_party_member pm WHERE pm.trip_member_id=tm.id AND pm.party_id=?))",trip,actor,party,party);
        if(devices.isEmpty()) return;
        var now=clock.instant();
        var targets=devices.stream().map(device->new Target(((Number)device.get("user_id")).longValue(),((Number)device.get("id")).longValue(),hash((String)device.get("fcm_token")))).toList();
        // Recipient foreign keys are acquired by the worker after this chat commits.
        // Chat writers lock their own user before the trip; locking another user here can deadlock.
        insert("INSERT INTO push_event(event_type,source_id,actor_id,trip_id,party_id,targets_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",type,source,actor,trip,party,json.writeValueAsString(targets),Timestamp.from(now),Timestamp.from(now.plusSeconds(ttlSeconds)));
    }
    private long insert(String sql,Object... values) {
        var keys=new GeneratedKeyHolder();
        db.update(connection->{var statement=connection.prepareStatement(sql,new String[]{"id"});for(int i=0;i<values.length;i++) statement.setObject(i+1,values[i]);return statement;},keys);
        return Objects.requireNonNull(keys.getKey()).longValue();
    }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception error) { throw new IllegalStateException("Cannot hash push registration"); }
    }
}
