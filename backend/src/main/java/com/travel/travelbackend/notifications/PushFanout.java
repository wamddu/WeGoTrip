package com.travel.travelbackend.notifications;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;

/** Materializes the committed recipient snapshot without locking recipients during chat writes. */
@Component
public class PushFanout {
    private static final Logger log=LoggerFactory.getLogger(PushFanout.class);
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate transaction;
    public PushFanout(JdbcTemplate db,ObjectMapper json,Clock clock,PlatformTransactionManager manager) {
        this.db=db;this.json=json;this.clock=clock;transaction=new TransactionTemplate(manager);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public void expandPending() {
        var events=db.queryForList("SELECT id FROM push_event WHERE expanded_at IS NULL ORDER BY created_at,id LIMIT 20",Long.class);
        for(long event:events) {
            try { transaction.executeWithoutResult(status->expand(event)); }
            catch(DataAccessException error) { log.warn("Push event {} expansion will retry after a database conflict.",event); }
        }
    }
    private void expand(long event) {
        var rows=db.queryForList("SELECT targets_json,created_at,expanded_at FROM push_event WHERE id=? FOR UPDATE",event);
        if(rows.isEmpty() || rows.getFirst().get("expanded_at")!=null) return;
        var row=rows.getFirst();
        for(var target:json.readValue((String)row.get("targets_json"),PushQueue.Target[].class)) {
            // A removed/reassigned device is omitted. A rotated token is rejected by the policy.
            db.update("INSERT INTO push_delivery(event_id,recipient_id,device_id,token_hash,next_attempt_at,created_at) SELECT ?,user_id,id,?,?,? FROM user_device WHERE id=? AND user_id=?",
                event,target.tokenHash(),Timestamp.from(clock.instant()),row.get("created_at"),target.deviceId(),target.recipientId());
        }
        // Retain the marker even if every delivery later cascades away on logout.
        db.update("UPDATE push_event SET expanded_at=?,targets_json='[]' WHERE id=?",Timestamp.from(clock.instant()),event);
    }
}
