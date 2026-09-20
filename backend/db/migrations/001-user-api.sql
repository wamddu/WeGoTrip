-- Historical migration: current code no longer uses token_hash (see 004).
-- Manual MySQL 8 migration for the existing users(id, name, email) table.
-- Historical legacy schema only; NOT applicable to the current WeGoTrip RDS.
-- Current code maps `user`; use the standalone 002 migration for that schema.
-- Review against the actual DDL and back up first. Run once; not auto-applied.
-- For a new empty development DB only, create the legacy baseline first:
-- CREATE TABLE users (id BIGINT AUTO_INCREMENT PRIMARY KEY,
--   name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE);
SET time_zone = '+00:00';

ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(100) NULL,
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER',
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN login_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN bank_account_encrypted VARCHAR(512) NULL,
    ADD COLUMN token_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

CREATE TABLE user_setting (
    user_id BIGINT NOT NULL PRIMARY KEY,
    push_notification_enabled TINYINT(1) NOT NULL DEFAULT 0,
    location_sharing_enabled TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT fk_user_setting_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE user_device (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    fcm_token VARCHAR(500) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    device_type VARCHAR(10) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    last_active_at DATETIME(6) NOT NULL,
    CONSTRAINT uq_user_device_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_user_device_user FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE user_consent (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    consent_type VARCHAR(30) NOT NULL,
    version VARCHAR(20) NOT NULL,
    agreed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_user_consent_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_consent_history (user_id, agreed_at, id)
);
INSERT INTO user_setting (user_id, push_notification_enabled, location_sharing_enabled)
SELECT id, 0, 0 FROM users;

-- Existing users have no password and their original registration timestamp is unknown.
-- Do not generate passwords or fabricate historical consents. Existing timestamps above
-- indicate migration time. The separate Auth reset/onboarding flow must handle these accounts.
