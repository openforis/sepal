-- Copy only into empty targets and leave the legacy database untouched.
-- Soft-deleted recipes are excluded; usernames follow the user module's lowercase convention.
SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='processing_recipe' AND TABLE_NAME='recipe')
    AND (SELECT COUNT(*) FROM recipe)=0,
    'INSERT INTO recipe (id, username, name, type, contents, creation_time, update_time, removed, type_version, project_id) SELECT id, LOWER(username), name, type, contents, creation_time, update_time, removed, type_version, project_id FROM processing_recipe.recipe WHERE removed = FALSE',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='processing_recipe' AND TABLE_NAME='project')
    AND (SELECT COUNT(*) FROM project)=0,
    'INSERT INTO project (id, username, name, default_asset_folder, default_workspace_folder) SELECT id, LOWER(username), name, default_asset_folder, default_workspace_folder FROM processing_recipe.project',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
