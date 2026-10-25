-- Apply after 012, with approval and schema snapshots of chat_poll/chat_poll_vote.
-- Existing polls remain single choice. Existing votes and all FKs are preserved.
-- MySQL DDL commits implicitly. Add the replacement index before dropping the old one.
SET @wegotrip_multiple_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='chat_poll' AND column_name='allow_multiple') = 0,
 'ALTER TABLE chat_poll ADD COLUMN allow_multiple BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE wegotrip_multiple_patch FROM @wegotrip_multiple_ddl;
EXECUTE wegotrip_multiple_patch;
DEALLOCATE PREPARE wegotrip_multiple_patch;

SET @wegotrip_multiple_ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='chat_poll_vote' AND index_name='uq_chat_poll_vote_option') = 0,
 'CREATE UNIQUE INDEX uq_chat_poll_vote_option ON chat_poll_vote(poll_id, user_id, option_id)', 'SELECT 1');
PREPARE wegotrip_multiple_patch FROM @wegotrip_multiple_ddl;
EXECUTE wegotrip_multiple_patch;
DEALLOCATE PREPARE wegotrip_multiple_patch;

SET @wegotrip_old_vote_index = (SELECT index_name FROM information_schema.statistics
 WHERE table_schema=DATABASE() AND table_name='chat_poll_vote' AND non_unique=0
 GROUP BY index_name HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')='poll_id,user_id' LIMIT 1);
SET @wegotrip_multiple_ddl = IF(@wegotrip_old_vote_index IS NULL, 'SELECT 1',
 CONCAT('ALTER TABLE chat_poll_vote DROP INDEX `', REPLACE(@wegotrip_old_vote_index,'`','``'), '`'));
PREPARE wegotrip_multiple_patch FROM @wegotrip_multiple_ddl;
EXECUTE wegotrip_multiple_patch;
DEALLOCATE PREPARE wegotrip_multiple_patch;
