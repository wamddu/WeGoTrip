-- Preserve shared archived trips after their owner withdraws.
ALTER TABLE trip MODIFY COLUMN owner_id BIGINT NULL;
