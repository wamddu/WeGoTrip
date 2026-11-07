-- Apply once after the existing chat migrations, before deploying location-enabled code.
-- Preflight: inspect SHOW CREATE TABLE chat_message; kind must accept 'LOCATION'.
-- Additive only: existing messages, columns and indexes are preserved. MySQL DDL commits implicitly.
CREATE TABLE chat_location (
 message_id BIGINT NOT NULL PRIMARY KEY,
 latitude DECIMAL(10,7) NULL,
 longitude DECIMAL(10,7) NULL,
 accuracy_m DECIMAL(10,2) NULL,
 captured_at DATETIME(6) NOT NULL,
 revoked_at DATETIME(6) NULL,
 CONSTRAINT fk_chat_location_message FOREIGN KEY(message_id) REFERENCES chat_message(id) ON DELETE CASCADE,
 CONSTRAINT ck_chat_location_state CHECK (
   (revoked_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND (accuracy_m IS NULL OR accuracy_m >= 0))
   OR (revoked_at IS NOT NULL AND latitude IS NULL AND longitude IS NULL AND accuracy_m IS NULL)
 )
);
