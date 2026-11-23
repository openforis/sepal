INSERT INTO task (id, state, username, operation, params, status_description, recipe_id, api_key_hash,
                  creation_time, update_time, progress_time, slot_time, removed)
SELECT id, state, username, operation, params::jsonb, status_description, recipe_id, api_key_hash,
       creation_time, update_time, progress_time, slot_time, removed <> 0
FROM mysql_source.task;
