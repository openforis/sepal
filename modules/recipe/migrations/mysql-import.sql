INSERT INTO recipe (id, username, name, type, contents, creation_time, update_time, removed, type_version, project_id, revision)
SELECT id, username, name, type, contents::jsonb, creation_time, update_time, removed <> 0, type_version, project_id, revision
FROM mysql_source.recipe;

INSERT INTO project (id, username, name, default_asset_folder, default_workspace_folder)
SELECT id, username, name, default_asset_folder, default_workspace_folder FROM mysql_source.project;
