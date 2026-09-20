-- Historical migration: current code no longer uses token_hash (see 004).
-- 2026-09-19: actual user_device had been changed outside this checkout.
-- Preflight confirmed token_hash absent and no duplicate SHA2(fcm_token,256).
-- Preserve the existing device, refresh_token, foreign keys and all other tables.
-- Run once only against that inspected state; do not rerun after successful apply.
ALTER TABLE user_device ADD COLUMN token_hash VARCHAR(64) NULL;
UPDATE user_device SET token_hash = SHA2(fcm_token, 256) WHERE token_hash IS NULL;
ALTER TABLE user_device
    MODIFY COLUMN token_hash VARCHAR(64) NOT NULL,
    ADD CONSTRAINT uq_user_device_token_hash UNIQUE (token_hash);
