-- Repair the existing WeGoTrip chat schema, including a partially applied 010.
-- Preflight: SHOW CREATE TABLE chat_message; SELECT COUNT(*) FROM chat_message;
-- This additive repair is for an EMPTY legacy chat_message or the newer schema.
-- If legacy rows exist, stop and plan their author/content/attachment backfill first.
-- Preserve sender_id, content, message_type, replies, attachments and all existing FKs.
-- No tables or rows are deleted. MySQL DDL commits implicitly.
-- Safe to run again after interruption: each addition checks information_schema.

CREATE TABLE IF NOT EXISTS chat_image_upload (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL,
 party_id BIGINT NULL,
 author_id BIGINT NULL,
 public_id VARCHAR(255) NOT NULL UNIQUE,
 image_url VARCHAR(1000) NOT NULL,
 claimed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
 FOREIGN KEY (party_id) REFERENCES trip_party(id) ON DELETE CASCADE,
 FOREIGN KEY (author_id) REFERENCES `user`(id) ON DELETE SET NULL
);

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='party_id') = 0,
 'ALTER TABLE chat_message ADD COLUMN `party_id` BIGINT NULL', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='author_id') = 0,
 'ALTER TABLE chat_message ADD COLUMN `author_id` BIGINT NULL', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='kind') = 0,
 'ALTER TABLE chat_message ADD COLUMN `kind` VARCHAR(10) NOT NULL DEFAULT ''TEXT''', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='text') = 0,
 'ALTER TABLE chat_message ADD COLUMN `text` VARCHAR(2000) NOT NULL DEFAULT ''''', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='image_upload_id') = 0,
 'ALTER TABLE chat_message ADD COLUMN `image_upload_id` BIGINT NULL', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='revision') = 0,
 'ALTER TABLE chat_message ADD COLUMN `revision` BIGINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='party_id' AND referenced_table_name='trip_party') = 0,
 'ALTER TABLE chat_message ADD CONSTRAINT fk_chat_realtime_party FOREIGN KEY (party_id) REFERENCES `trip_party`(id) ON DELETE CASCADE', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='author_id' AND referenced_table_name='user') = 0,
 'ALTER TABLE chat_message ADD CONSTRAINT fk_chat_realtime_author FOREIGN KEY (author_id) REFERENCES `user`(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='image_upload_id' AND referenced_table_name='chat_image_upload') = 0,
 'ALTER TABLE chat_message ADD CONSTRAINT fk_chat_realtime_image FOREIGN KEY (image_upload_id) REFERENCES `chat_image_upload`(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_message' AND index_name='idx_chat_history') = 0,
 'CREATE INDEX idx_chat_history ON chat_message(trip_id,party_id,id)', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

SET @wegotrip_chat_ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_message' AND column_name='image_upload_id' AND non_unique=0) = 0,
 'CREATE UNIQUE INDEX uq_chat_realtime_image ON chat_message(image_upload_id)', 'SELECT 1');
PREPARE wegotrip_chat_patch FROM @wegotrip_chat_ddl;
EXECUTE wegotrip_chat_patch;
DEALLOCATE PREPARE wegotrip_chat_patch;

CREATE TABLE IF NOT EXISTS chat_poll (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 message_id BIGINT NOT NULL UNIQUE,
 question VARCHAR(200) NOT NULL,
 closed BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS chat_poll_option (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 poll_id BIGINT NOT NULL,
 label VARCHAR(150) NOT NULL,
 saved_place_id BIGINT NULL,
 place_name VARCHAR(150) NOT NULL DEFAULT '',
 place_address VARCHAR(255) NOT NULL DEFAULT '',
 FOREIGN KEY (poll_id) REFERENCES chat_poll(id) ON DELETE CASCADE,
 FOREIGN KEY (saved_place_id) REFERENCES saved_place(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS chat_poll_vote (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 poll_id BIGINT NOT NULL,
 option_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 UNIQUE (poll_id, user_id),
 FOREIGN KEY (poll_id) REFERENCES chat_poll(id) ON DELETE CASCADE,
 FOREIGN KEY (option_id) REFERENCES chat_poll_option(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE
);

