-- One-off copy from the legacy `sdms` schema, kept out of the schema stream so a
-- fresh database can be built without it. Each table copies only if the source exists and the target is
-- still empty, so this is idempotent and never modifies the sources. Usernames are lowercased on the way
-- in: the legacy tables stored them as typed, while `sepal_user` is uniformly lowercase and every read
-- path lowercases anyway.
--
-- Lifetime is a STORED deadline that events ratchet forward (docs/session-expiration-model.md), so the
-- legacy `earliest_timeout_time` is not carried over: copied ACTIVE sessions get their deadline and cap
-- anchor seeded from update_time, otherwise the first sweep would see a NULL deadline (never expires)
-- and a NULL anchor (unbounded ratchet).
--
-- The runner executes the whole file as one multi-statement query, so the session @vars and
-- PREPARE/EXECUTE persist across statements.

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='worker_session')
    AND (SELECT COUNT(*) FROM `worker_session`)=0,
    'INSERT INTO `worker_session` (`id`, `state`, `username`, `worker_type`, `instance_type`, `instance_id`, `host`, `creation_time`, `update_time`, `api_key`, `active_time`, `timeout_time`) SELECT `id`, `state`, LOWER(`username`), `worker_type`, `instance_type`, `instance_id`, `host`, `creation_time`, `update_time`, `api_key`, CASE WHEN `state`=''ACTIVE'' THEN `update_time` END, CASE WHEN `state`=''ACTIVE'' THEN `update_time` + INTERVAL 30 MINUTE END FROM sdms.`worker_session`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='task')
    AND (SELECT COUNT(*) FROM `task`)=0,
    'INSERT INTO `task` (id, state, username, session_id, operation, params, status_description, creation_time, update_time, removed, recipe_id) SELECT id, state, LOWER(username), session_id, operation, params, status_description, creation_time, update_time, removed, recipe_id FROM sdms.`task`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
