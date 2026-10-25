-- Apply once after 009. Back up the schema first; MySQL DDL commits implicitly.
-- NULL party_id identifies the whole-trip channel. Party deletion deletes its chat.
CREATE TABLE chat_image_upload (
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
CREATE TABLE chat_message (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL,
 -- Existing WeGoTrip columns remain after the additive 011 repair.
 sender_id BIGINT NULL,
 reply_to_message_id BIGINT NULL,
 content TEXT NULL,
 message_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
 deleted_at TIMESTAMP NULL,
 party_id BIGINT NULL,
 author_id BIGINT NULL,
 kind VARCHAR(10) NOT NULL,
 text VARCHAR(2000) NOT NULL DEFAULT '',
 image_upload_id BIGINT NULL UNIQUE,
 revision BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
 FOREIGN KEY (party_id) REFERENCES trip_party(id) ON DELETE CASCADE,
 FOREIGN KEY (author_id) REFERENCES `user`(id) ON DELETE SET NULL,
 FOREIGN KEY (image_upload_id) REFERENCES chat_image_upload(id) ON DELETE SET NULL
);
CREATE INDEX idx_chat_history ON chat_message(trip_id, party_id, id);
CREATE TABLE chat_poll (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 message_id BIGINT NOT NULL UNIQUE,
 question VARCHAR(200) NOT NULL,
 closed BOOLEAN NOT NULL DEFAULT FALSE,
 closes_at TIMESTAMP(6) NULL DEFAULT NULL,
 allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
);
CREATE INDEX idx_chat_poll_deadline ON chat_poll(closed, closes_at);
CREATE TABLE chat_poll_option (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 poll_id BIGINT NOT NULL,
 label VARCHAR(150) NOT NULL,
 saved_place_id BIGINT NULL,
 place_name VARCHAR(150) NOT NULL DEFAULT '',
 place_address VARCHAR(255) NOT NULL DEFAULT '',
 FOREIGN KEY (poll_id) REFERENCES chat_poll(id) ON DELETE CASCADE,
 FOREIGN KEY (saved_place_id) REFERENCES saved_place(id) ON DELETE SET NULL
);
CREATE TABLE chat_poll_vote (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 poll_id BIGINT NOT NULL,
 option_id BIGINT NOT NULL,
 user_id BIGINT NOT NULL,
 CONSTRAINT uq_chat_poll_vote_option UNIQUE (poll_id, user_id, option_id),
 FOREIGN KEY (poll_id) REFERENCES chat_poll(id) ON DELETE CASCADE,
 FOREIGN KEY (option_id) REFERENCES chat_poll_option(id) ON DELETE CASCADE,
 FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE
);
