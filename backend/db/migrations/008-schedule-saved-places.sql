-- Approved schedule/place additions, 2026-10-01.
-- Run once against the inspected schema after 007. MySQL DDL commits implicitly:
-- capture SHOW CREATE TABLE for both tables and verify all five columns are absent
-- before applying. Stop and inspect any partially applied migration before retrying.
-- Existing rows remain intact; no automatic linking/backfill by name/address.
ALTER TABLE saved_place
 ADD COLUMN latitude DECIMAL(10,7) NULL,
 ADD COLUMN longitude DECIMAL(10,7) NULL,
 ADD COLUMN note TEXT NULL;

ALTER TABLE itinerary_item
 ADD COLUMN saved_place_id BIGINT NULL,
 ADD COLUMN note TEXT NULL,
 ADD INDEX idx_itinerary_saved_place(saved_place_id),
 ADD CONSTRAINT fk_itinerary_saved_place
  FOREIGN KEY(saved_place_id) REFERENCES saved_place(id) ON DELETE SET NULL;

-- Same-trip references, paired coordinate ranges, notes <= 3000 characters, and
-- PLACE_IN_USE deletion protection are enforced by the API. SET NULL preserves
-- legacy place_name/address snapshots if a place is removed outside the API.
-- Google place IDs, timestamps, versions, and unrelated schema are unchanged.
