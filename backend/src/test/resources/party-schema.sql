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
CREATE TABLE IF NOT EXISTS saved_place (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 name VARCHAR(150) NOT NULL,
 address VARCHAR(255),
 category VARCHAR(50),
 latitude DECIMAL(10,7),
 longitude DECIMAL(10,7),
 note TEXT
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
 address VARCHAR(255),
 saved_place_id BIGINT REFERENCES saved_place(id) ON DELETE SET NULL,
 note TEXT
);
CREATE TABLE IF NOT EXISTS expense (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 payer_trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE RESTRICT,
 title VARCHAR(150) NOT NULL,
 amount DECIMAL(15,2) NOT NULL,
 expense_date DATE NOT NULL,
 party_id BIGINT REFERENCES trip_party(id) ON DELETE SET NULL,
 note TEXT
);
CREATE TABLE IF NOT EXISTS expense_participant (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 expense_id BIGINT NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
 trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE CASCADE,
 amount DECIMAL(15,2) NOT NULL,
 UNIQUE(expense_id, trip_member_id)
);
CREATE TABLE IF NOT EXISTS settlement_confirmation (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 settlement_revision BIGINT NOT NULL,
 from_trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE RESTRICT,
 to_trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE RESTRICT,
 amount DECIMAL(18,2) NOT NULL,
 completed TINYINT DEFAULT 0 NOT NULL,
 version BIGINT DEFAULT 0 NOT NULL,
 updated_by_trip_member_id BIGINT NOT NULL REFERENCES trip_member(id) ON DELETE RESTRICT,
 updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL,
 UNIQUE(trip_id, settlement_revision, from_trip_member_id, to_trip_member_id)
);
