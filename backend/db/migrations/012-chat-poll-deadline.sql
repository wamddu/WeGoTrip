-- Approved additive poll deadline migration. Apply after 010 or 011.
-- Save SHOW CREATE TABLE chat_poll first. MySQL DDL commits implicitly.
-- Existing polls remain untimed (NULL). No existing votes or options are changed.
SET @wegotrip_poll_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll' AND column_name='closes_at') = 0,
 'ALTER TABLE chat_poll ADD COLUMN closes_at TIMESTAMP(6) NULL DEFAULT NULL', 'SELECT 1');
PREPARE wegotrip_poll_patch FROM @wegotrip_poll_ddl;
EXECUTE wegotrip_poll_patch;
DEALLOCATE PREPARE wegotrip_poll_patch;

SET @wegotrip_poll_ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_poll' AND index_name='idx_chat_poll_deadline') = 0,
 'CREATE INDEX idx_chat_poll_deadline ON chat_poll(closed, closes_at)', 'SELECT 1');
PREPARE wegotrip_poll_patch FROM @wegotrip_poll_ddl;
EXECUTE wegotrip_poll_patch;
DEALLOCATE PREPARE wegotrip_poll_patch;
