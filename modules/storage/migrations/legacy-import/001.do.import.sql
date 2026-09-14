-- One-off copy from the `user_storage` database this module was called before the rename, kept out of
-- the schema stream so a fresh database can be built without it. It copies only if the source exists
-- and the target is still empty, so it is idempotent and never modifies the source. `id` is copied
-- verbatim to preserve the ordering getMostRecentEvents relies on, and usernames are lowercased on the
-- way in even though the source already normalizes them.
--
-- The runner executes the whole file as one multi-statement query, so the session @vars and
-- PREPARE/EXECUTE persist across statements.

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='user_storage' AND TABLE_NAME='history')
    AND (SELECT COUNT(*) FROM `history`)=0,
    'INSERT INTO `history` (id, username, event, timestamp) SELECT id, LOWER(username), event, timestamp FROM user_storage.`history`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
