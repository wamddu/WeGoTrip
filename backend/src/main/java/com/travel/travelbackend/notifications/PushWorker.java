package com.travel.travelbackend.notifications;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class PushWorker {
    private final JdbcTemplate db;
    private final Clock clock;
    private final PushSender sender;
    private final PushFanout fanout;
    private final Map<String,PushPolicy> policies;
    private final TransactionTemplate transaction;
    private final boolean enabled, scheduled;
    private record Job(long id,String type,String lease,int attempts,Instant expires) {}
    public PushWorker(JdbcTemplate db,Clock clock,PushSender sender,PushFanout fanout,List<PushPolicy> policies,PlatformTransactionManager manager,
        @Value("${push.enabled:false}") boolean enabled,@Value("${push.worker-enabled:true}") boolean scheduled) {
        this.db=db;this.clock=clock;this.sender=sender;this.fanout=fanout;this.policies=policies.stream().collect(Collectors.toMap(PushPolicy::type,Function.identity()));
        transaction=new TransactionTemplate(manager);this.enabled=enabled;this.scheduled=scheduled;
    }
    @Scheduled(fixedDelayString="${push.worker-delay-ms:1000}",initialDelayString="${push.worker-delay-ms:1000}")
    public void scheduled() { if(scheduled) drain(); }
    public int drain() {
        if(!enabled) return 0;
        fanout.expandPending();
        if(!sender.available()) return 0;
        var now=Timestamp.from(clock.instant());
        var candidates=db.queryForList("SELECT id FROM push_delivery WHERE (status IN ('PENDING','RETRY') AND next_attempt_at<=?) OR (status='SENDING' AND lease_until<=?) ORDER BY id LIMIT 20",Long.class,now,now);
        int count=0;
        for(long id:candidates) {
            Job job=claim(id); if(job==null) continue;
            count++;
            if(!job.expires().isAfter(clock.instant())) { finish(job,"EXPIRED","TTL_EXPIRED",null);continue; }
            var policy=policies.get(job.type());
            Optional<PushSender.Message> message;
            try { message=policy==null?Optional.empty():policy.resolve(job.id(),job.lease()); }
            catch(RuntimeException error) { retry(job,"POLICY_ERROR",60);continue; }
            if(message.isEmpty()) { finish(job,"SKIPPED","RECIPIENT_UNAVAILABLE",null);continue; }
            PushSender.Result result;
            try { result=sender.send(message.get()); }
            catch(RuntimeException error) { result=new PushSender.Result(PushSender.Status.RETRY,"SENDER_ERROR",60); }
            switch(result.status()) {
                case ACCEPTED -> finish(job,"SENT",null,null);
                case FAILED -> finish(job,"FAILED",result.code(),null);
                case INVALID_TOKEN -> retire(job,message.get().token());
                case RETRY -> retry(job,result.code(),result.retryAfterSeconds());
            }
        }
        return count;
    }
    private void retry(Job job,String code,int minimumSeconds) {
        long delay=Math.max(minimumSeconds,Math.min(3600,15L << Math.min(10,job.attempts()-1)));
        Instant next=clock.instant().plusSeconds(delay);
        if(!next.isBefore(job.expires())) finish(job,"EXPIRED",code,null);
        else if(job.attempts()>=7) finish(job,"FAILED",code,null);
        else finish(job,"RETRY",code,next);
    }
    private Job claim(long id) {
        return transaction.execute(status->{
            Instant now=clock.instant(); String lease=UUID.randomUUID().toString();
            int claimed=db.update("UPDATE push_delivery SET status='SENDING',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=? AND ((status IN ('PENDING','RETRY') AND next_attempt_at<=?) OR (status='SENDING' AND lease_until<=?))",lease,Timestamp.from(now.plusSeconds(300)),id,Timestamp.from(now),Timestamp.from(now));
            if(claimed==0) return null;
            var rows=db.queryForList("SELECT d.attempts,e.event_type,e.expires_at FROM push_delivery d JOIN push_event e ON e.id=d.event_id WHERE d.id=?",id);
            if(rows.isEmpty()) return null;
            var row=rows.getFirst();
            return new Job(id,(String)row.get("event_type"),lease,((Number)row.get("attempts")).intValue(),((Timestamp)row.get("expires_at")).toInstant());
        });
    }
    private void finish(Job job,String state,String error,Instant retry) {
        db.update("UPDATE push_delivery SET status=?,last_error_code=?,next_attempt_at=?,sent_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status='SENDING' AND lease_token=?",state,error,Timestamp.from(retry==null?clock.instant():retry),"SENT".equals(state)?Timestamp.from(clock.instant()):null,job.id(),job.lease());
    }
    private void retire(Job job,String token) {
        transaction.executeWithoutResult(status->{
            var rows=db.queryForList("SELECT ud.id,ud.fcm_token FROM user_device ud JOIN push_delivery d ON d.device_id=ud.id AND d.recipient_id=ud.user_id WHERE d.id=? AND d.status='SENDING' AND d.lease_token=? FOR UPDATE",job.id(),job.lease());
            if(!rows.isEmpty() && token.equals(rows.getFirst().get("fcm_token")))
                db.update("DELETE FROM user_device WHERE id=?",rows.getFirst().get("id"));
            else finish(job,"SKIPPED","TOKEN_CHANGED",null);
        });
    }
}
