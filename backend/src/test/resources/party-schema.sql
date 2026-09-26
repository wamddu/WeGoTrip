-- In-memory test fixture matching the existing MySQL tables; never applied to the configured DB.
CREATE TABLE IF NOT EXISTS trip_party (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 name VARCHAR(50) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS trip_party_member (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 party_id BIGINT NOT NULL REFERENCES trip_party(id) ON DELETE CASCADE,
 trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE CASCADE,
 UNIQUE(party_id, trip_member_id)
);
CREATE TABLE IF NOT EXISTS itinerary_item (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 party_id BIGINT REFERENCES trip_party(id) ON DELETE SET NULL,
 title VARCHAR(150) NOT NULL,
 `date` DATE NOT NULL,
 start_time TIME,
 end_time TIME,
 place_name VARCHAR(150) NOT NULL,
 address VARCHAR(255)
);
