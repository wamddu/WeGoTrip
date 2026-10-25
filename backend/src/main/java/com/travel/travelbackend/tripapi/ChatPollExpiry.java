package com.travel.travelbackend.tripapi;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static com.travel.travelbackend.tripapi.TripStore.*;

/** Persist expirations and notify subscribers; voting also checks the deadline independently. */
@Component
public class ChatPollExpiry {
    private final TripStore s;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final boolean enabled;

    public ChatPollExpiry(TripStore s, ApplicationEventPublisher events, PlatformTransactionManager manager,
        @Value("${chat.poll-expiry.enabled:true}") boolean enabled) {
        this.s=s; this.events=events; this.transaction=new TransactionTemplate(manager); this.enabled=enabled;
    }

    @Scheduled(fixedDelayString="${chat.poll-expiry.delay-ms:1000}", initialDelayString="${chat.poll-expiry.delay-ms:1000}")
    public void scheduled() { if(enabled) expireDue(); }

    public int expireDue() {
        var candidates=s.db.queryForList("SELECT p.id,m.trip_id FROM chat_poll p JOIN chat_message m ON m.id=p.message_id WHERE p.closed=FALSE AND p.closes_at<=? ORDER BY p.closes_at,p.id LIMIT 100",s.now());
        int count=0;
        for(var candidate:candidates) {
            boolean changed=Boolean.TRUE.equals(transaction.execute(status->{
                long trip=n(candidate,"trip_id"), poll=n(candidate,"id");
                // Match the trip -> child lock order used by voting, archival and party deletion.
                if(s.one("SELECT id FROM trip WHERE id=? FOR UPDATE",trip)==null) return false;
                var message=s.one("SELECT m.id,m.party_id FROM chat_poll p JOIN chat_message m ON m.id=p.message_id WHERE p.id=? AND m.trip_id=?",poll,trip);
                if(message==null || s.db.update("UPDATE chat_poll SET closed=TRUE WHERE id=? AND closed=FALSE AND closes_at<=?",poll,s.now())==0) return false;
                s.db.update("UPDATE chat_message SET revision=revision+1 WHERE id=?",n(message,"id"));
                events.publishEvent(new ChatService.Changed(trip,message.get("party_id")==null?null:n(message,"party_id"),n(message,"id")));
                return true;
            }));
            if(changed) count++;
        }
        return count;
    }
}
