-- Historical migration: current code no longer uses token_hash (see 004).
-- Standalone migration for the inspected WeGoTrip schema (2026-09-16).
-- Do NOT run 001 first: it targets a different, legacy users table.
-- Existing user rows, password values and foreign keys are preserved.
-- Run once. MySQL DDL commits implicitly; stop on any error.
-- Preflight: user.bank_account_number contains no nonempty values;
-- user_device contains no rows. Nonempty legacy accounts need a separate
-- encryption migration before deploying this mapping.
ALTER TABLE `user`
    ADD COLUMN bank_account_encrypted VARCHAR(512) NULL,
    ADD COLUMN token_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE user_device ADD COLUMN token_hash VARCHAR(64) NULL;
UPDATE user_device SET token_hash = SHA2(fcm_token, 256) WHERE token_hash IS NULL;
-- Install exact-token uniqueness before removing collation-based uniqueness.
ALTER TABLE user_device
    MODIFY COLUMN token_hash VARCHAR(64) NOT NULL,
    ADD CONSTRAINT uq_user_device_token_hash UNIQUE (token_hash);
ALTER TABLE user_device DROP INDEX uk_user_device_fcm_token;

-- Change defaults only, preserving any existing preference values.
ALTER TABLE user_setting
    ALTER COLUMN push_notification_enabled SET DEFAULT 0,
    ALTER COLUMN location_sharing_enabled SET DEFAULT 0;
CREATE INDEX idx_user_consent_history ON user_consent (user_id, agreed_at, id);
