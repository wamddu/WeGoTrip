-- User-approved push outbox. Apply after 013; save existing schema first.
-- No historical messages are queued. Existing business tables are not altered.
CREATE TABLE IF NOT EXISTS push_event (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 event_type VARCHAR(40) NOT NULL,
 source_id BIGINT NOT NULL,
 actor_id BIGINT NULL,
 trip_id BIGINT NULL,
 party_id BIGINT NULL,
 targets_json MEDIUMTEXT NOT NULL,
 expanded_at TIMESTAMP(6) NULL,
 created_at TIMESTAMP(6) NOT NULL,
 expires_at TIMESTAMP(6) NOT NULL,
 UNIQUE KEY uq_push_event_source (event_type, source_id),
 INDEX idx_push_event_expand (expanded_at, created_at, id),
 FOREIGN KEY (actor_id) REFERENCES `user`(id) ON DELETE SET NULL,
 FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
 FOREIGN KEY (party_id) REFERENCES trip_party(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS push_delivery (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 event_id BIGINT NOT NULL,
 recipient_id BIGINT NOT NULL,
 device_id BIGINT NOT NULL,
 token_hash CHAR(64) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
 attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMP(6) NOT NULL,
 lease_until TIMESTAMP(6) NULL,
 lease_token VARCHAR(36) NULL,
 last_error_code VARCHAR(80) NULL,
 sent_at TIMESTAMP(6) NULL,
 created_at TIMESTAMP(6) NOT NULL,
 UNIQUE KEY uq_push_delivery_device (event_id, device_id),
 INDEX idx_push_delivery_due (status, next_attempt_at, id),
 INDEX idx_push_delivery_lease (status, lease_until, id),
 FOREIGN KEY (event_id) REFERENCES push_event(id) ON DELETE CASCADE,
 FOREIGN KEY (recipient_id) REFERENCES `user`(id) ON DELETE CASCADE,
 FOREIGN KEY (device_id) REFERENCES user_device(id) ON DELETE CASCADE
);
