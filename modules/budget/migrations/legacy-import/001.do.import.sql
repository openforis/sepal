-- One-off copy from the legacy `sdms` schema, kept out of the schema stream so a fresh database can be
-- built without it. Each table copies only if the source exists and the target is still empty, so this
-- is idempotent and never modifies `sdms`. Usernames are lowercased on the way in: the legacy tables
-- stored them as typed, while `sepal_user` is uniformly lowercase and every read path lowercases anyway.
-- The runner executes the whole file as one multi-statement query, so the session @vars and
-- PREPARE/EXECUTE persist across statements.

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_budget')
    AND (SELECT COUNT(*) FROM `user_budget`)=0,
    'INSERT INTO `user_budget` (username, monthly_instance, monthly_storage, storage_quota) SELECT LOWER(username), monthly_instance, monthly_storage, storage_quota FROM sdms.`user_budget`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='default_user_budget')
    AND (SELECT COUNT(*) FROM `default_user_budget`)=0,
    'INSERT INTO `default_user_budget` SELECT * FROM sdms.`default_user_budget`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_monthly_storage')
    AND (SELECT COUNT(*) FROM `user_monthly_storage`)=0,
    'INSERT INTO `user_monthly_storage` (username, year, month, gb_hours, storage_used, update_time) SELECT LOWER(username), year, month, gb_hours, storage_used, update_time FROM sdms.`user_monthly_storage`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_spending')
    AND (SELECT COUNT(*) FROM `user_spending`)=0,
    'INSERT INTO `user_spending` (username, instance_spending, storage_spending, storage_usage) SELECT LOWER(username), instance_spending, storage_spending, storage_usage FROM sdms.`user_spending`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='budget_update_request')
    AND (SELECT COUNT(*) FROM `budget_update_request`)=0,
    'INSERT INTO `budget_update_request` (id, username, state, message, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time) SELECT id, LOWER(username), state, message, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time FROM sdms.`budget_update_request`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_seed := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='worker_session')
    AND (SELECT COUNT(*) FROM `open_session_use`)=0,
    'INSERT INTO `open_session_use` (session_id, username, instance_type, from_time, to_time) SELECT id, LOWER(username), instance_type, creation_time, CASE WHEN state=''CLOSED'' THEN update_time ELSE NULL END FROM sdms.`worker_session` WHERE state IN (''PENDING'',''ACTIVE'') OR (state=''CLOSED'' AND update_time >= DATE_FORMAT(NOW(),''%Y-%m-01''))',
    'DO 0'));
PREPARE _s FROM @do_seed; EXECUTE _s; DEALLOCATE PREPARE _s;
