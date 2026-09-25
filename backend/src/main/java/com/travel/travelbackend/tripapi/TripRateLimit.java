package com.travel.travelbackend.tripapi;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import java.sql.Timestamp;
import static com.travel.travelbackend.tripapi.TripStore.*;

/** Shared fixed windows in MySQL; rejected attempts must not roll back counters. */
@Service
public class TripRateLimit {
    private final TripStore s;
    public TripRateLimit(TripStore s){this.s=s;}
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public boolean allow(String bucket,int seconds,int maximum){
        long window=s.clock.instant().getEpochSecond()/seconds;
        String key=hash(bucket)+":"+window;
        s.db.update("INSERT INTO api_rate_limit(bucket_key,hits,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1",key,Timestamp.from(java.time.Instant.ofEpochSecond((window+2)*seconds)));
        long hits=n(s.one("SELECT hits FROM api_rate_limit WHERE bucket_key=? FOR UPDATE",key),"hits");
        s.db.update("DELETE FROM api_rate_limit WHERE expires_at<?",s.now());return hits<=maximum;
    }
}
