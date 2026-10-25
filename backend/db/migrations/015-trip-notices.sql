-- Apply only after user approval. Existing business and push tables are unchanged.
CREATE TABLE IF NOT EXISTS trip_notice (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL,
 author_id BIGINT NULL,
 title VARCHAR(100) NOT NULL,
 body TEXT NOT NULL,
 pinned BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP(6) NOT NULL,
 updated_at TIMESTAMP(6) NOT NULL,
 INDEX idx_trip_notice_list (trip_id, id),
 FOREIGN KEY (trip_id) REFERENCES trip(id) ON DELETE CASCADE,
 FOREIGN KEY (author_id) REFERENCES `user`(id) ON DELETE SET NULL
);
