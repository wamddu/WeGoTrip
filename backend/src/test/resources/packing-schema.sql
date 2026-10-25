-- Isolated H2 fixture of existing packing_item; never applied to the configured MySQL DB.
CREATE TABLE IF NOT EXISTS packing_item (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 trip_id BIGINT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
 owner_trip_member_id BIGINT REFERENCES trip_member(id) ON DELETE SET NULL,
 title VARCHAR(150) NOT NULL,
 done TINYINT DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS fk_packing_trip ON packing_item(trip_id);
CREATE INDEX IF NOT EXISTS fk_packing_owner ON packing_item(owner_trip_member_id);
