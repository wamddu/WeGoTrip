-- 2026-09-20: replace token hashes with exact, case-sensitive FCM token uniqueness.
-- MySQL 8 only. utf8mb4_0900_bin is NO PAD, so trailing spaces stay distinct too.
-- Preflight: no duplicates under the target collation; existing 3 devices preserved.
-- Apply once to the inspected schema with uq_user_device_token_hash present.
ALTER TABLE user_device
    MODIFY COLUMN fcm_token VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
    ADD CONSTRAINT uq_user_device_fcm_token UNIQUE (fcm_token),
    DROP INDEX uq_user_device_token_hash,
    DROP COLUMN token_hash;
