-- One-off copy of the task history from the worker, which ran tasks before task-manager, kept out of the schema
-- stream so a fresh database is built without it. It copies only if the source exists and this table is still
-- empty, so it is idempotent and never modifies the source. Tasks the worker left unfinished cannot be resumed:
-- PENDING and ACTIVE become FAILED as interrupted, CANCELING becomes CANCELED. Removed tasks are not copied.
--
-- The runner executes the whole file as one multi-statement query, so the session @vars and
-- PREPARE/EXECUTE persist across statements.

SET @interrupted := '{"messageKey":"tasks.status.interrupted","defaultMessage":"Interrupted by a server restart. Run the task again."}';
SET @canceled := '{"defaultMessage":"Canceled.","messageKey":"tasks.status.canceled","messageArgs":{}}';

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='worker' AND TABLE_NAME='task')
    AND (SELECT COUNT(*) FROM `task`)=0,
    'INSERT INTO `task` (id, state, username, operation, params, status_description, recipe_id, creation_time, update_time) SELECT id, CASE WHEN state IN (''PENDING'', ''ACTIVE'') THEN ''FAILED'' WHEN state = ''CANCELING'' THEN ''CANCELED'' ELSE state END, LOWER(username), operation, params, CASE WHEN state IN (''PENDING'', ''ACTIVE'') THEN @interrupted WHEN state = ''CANCELING'' THEN @canceled ELSE status_description END, recipe_id, creation_time, update_time FROM worker.`task` WHERE removed = 0',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
