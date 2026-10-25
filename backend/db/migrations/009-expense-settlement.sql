-- Approved expense/settlement additions, 2026-10-02.
-- MySQL 8.0. DDL commits implicitly. Back up the database and inspect the actual
-- definitions before applying. Each section is a complete migration step.
-- For a retry, verify and skip completed steps; never rerun ALTER blindly or
-- replace an existing table whose definition differs from this migration.
-- Existing expense rows remain unchanged except nullable party/note defaults;
-- existing trips start at settlement revision 0. No device records are imported.

-- @step expense
ALTER TABLE expense
 ADD COLUMN party_id BIGINT NULL,
 ADD COLUMN note TEXT NULL,
 ADD INDEX idx_expense_party(party_id),
 ADD CONSTRAINT fk_expense_party
  FOREIGN KEY(party_id) REFERENCES trip_party(id) ON DELETE SET NULL;

-- @step trip
ALTER TABLE trip
 ADD COLUMN settlement_revision BIGINT NOT NULL DEFAULT 0;

-- @step confirmation
CREATE TABLE settlement_confirmation (
 id BIGINT NOT NULL AUTO_INCREMENT,
 trip_id BIGINT NOT NULL,
 settlement_revision BIGINT NOT NULL,
 from_trip_member_id BIGINT NOT NULL,
 to_trip_member_id BIGINT NOT NULL,
 amount DECIMAL(18,2) NOT NULL,
 completed TINYINT(1) NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 0,
 updated_by_trip_member_id BIGINT NOT NULL,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id),
 UNIQUE KEY uk_settlement_confirmation(trip_id,settlement_revision,from_trip_member_id,to_trip_member_id),
 KEY idx_confirmation_from(from_trip_member_id),
 KEY idx_confirmation_to(to_trip_member_id),
 KEY idx_confirmation_actor(updated_by_trip_member_id),
 CONSTRAINT fk_confirmation_trip FOREIGN KEY(trip_id) REFERENCES trip(id) ON DELETE CASCADE,
 CONSTRAINT fk_confirmation_from FOREIGN KEY(from_trip_member_id) REFERENCES trip_member(id) ON DELETE RESTRICT,
 CONSTRAINT fk_confirmation_to FOREIGN KEY(to_trip_member_id) REFERENCES trip_member(id) ON DELETE RESTRICT,
 CONSTRAINT fk_confirmation_actor FOREIGN KEY(updated_by_trip_member_id) REFERENCES trip_member(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Services validate same-trip membership/group references, integer won amounts,
-- split totals and computed transfer amounts. Expense writes increment revision
-- in the same transaction; confirmation version protects concurrent completion.
-- No changes to expense_participant, existing money columns or trip.version.
