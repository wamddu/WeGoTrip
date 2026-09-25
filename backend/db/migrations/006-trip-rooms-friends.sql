-- Run once against the inspected WeGoTrip schema, after 005.
-- Preflight: trip, trip_member, friendship and friend_request are empty.
-- Stop if any contains data: legacy owner/relationship backfill is required first.
-- Existing unrelated tables, users and foreign keys are preserved.
ALTER TABLE trip
 MODIFY invite_code VARCHAR(30) NULL,
 ADD owner_id BIGINT NOT NULL,
 ADD budget BIGINT NOT NULL DEFAULT 0,
 ADD status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
 ADD max_members INT NOT NULL DEFAULT 30,
 ADD version BIGINT NOT NULL DEFAULT 0,
 ADD created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 ADD updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 ADD CONSTRAINT fk_trip_owner FOREIGN KEY(owner_id) REFERENCES `user`(id),
 ADD INDEX idx_trip_created(created_at,id);
-- Legacy invite_code and member.role are retained for compatibility, but not used
-- for authorization. Owner role is derived from trip.owner_id.
ALTER TABLE trip_member ADD joined_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
ALTER TABLE friendship ADD CONSTRAINT ck_friendship_order CHECK(user1_id < user2_id);
ALTER TABLE friend_request
 DROP INDEX uk_friend_request_pair,
 ADD responded_at TIMESTAMP(6) NULL,
 ADD user_low_id BIGINT NOT NULL,
 ADD user_high_id BIGINT NOT NULL,
 ADD pending_low BIGINT GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN user_low_id ELSE NULL END) STORED,
 ADD pending_high BIGINT GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN user_high_id ELSE NULL END) STORED,
 ADD CONSTRAINT uq_friend_request_pending UNIQUE(pending_low,pending_high),
 ADD CONSTRAINT ck_friend_request_pair CHECK(user_low_id=LEAST(requester_id,receiver_id) AND user_high_id=GREATEST(requester_id,receiver_id)),
 ADD CONSTRAINT ck_friend_request_self CHECK(requester_id <> receiver_id),
 ADD INDEX idx_friend_request_sent(requester_id,status,created_at,id),
 ADD INDEX idx_friend_request_received(receiver_id,status,created_at,id);
CREATE TABLE trip_invitation (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, trip_id BIGINT NOT NULL, inviter_id BIGINT NOT NULL, invitee_id BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP(6) NOT NULL,
 expires_at TIMESTAMP(6) NOT NULL, responded_at TIMESTAMP(6) NULL,
 pending_invitee BIGINT GENERATED ALWAYS AS (CASE WHEN status='PENDING' THEN invitee_id ELSE NULL END) STORED,
 CONSTRAINT uq_trip_invitation_pending UNIQUE(trip_id,pending_invitee),
 FOREIGN KEY(trip_id) REFERENCES trip(id), FOREIGN KEY(inviter_id) REFERENCES `user`(id), FOREIGN KEY(invitee_id) REFERENCES `user`(id),
 INDEX idx_trip_invitation_received(invitee_id,status,created_at,id), INDEX idx_trip_invitation_sent(trip_id,status,created_at,id)
);
CREATE TABLE trip_invite_code (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, trip_id BIGINT NOT NULL, digest CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMP(6) NOT NULL, revoked_at TIMESTAMP(6) NULL, created_at TIMESTAMP(6) NOT NULL,
 FOREIGN KEY(trip_id) REFERENCES trip(id), INDEX idx_trip_code(trip_id,revoked_at)
);
CREATE TABLE api_idempotency (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT NOT NULL, operation VARCHAR(30) NOT NULL,
 request_key VARCHAR(36) NOT NULL, request_digest CHAR(64) NOT NULL, response_status INT NOT NULL,
 response_body TEXT NOT NULL, expires_at TIMESTAMP(6) NOT NULL,
 UNIQUE(user_id,operation,request_key), FOREIGN KEY(user_id) REFERENCES `user`(id)
);
CREATE TABLE api_rate_limit (
 bucket_key VARCHAR(100) PRIMARY KEY, hits INT NOT NULL, expires_at TIMESTAMP(6) NOT NULL,
 INDEX idx_rate_expiry(expires_at)
);
