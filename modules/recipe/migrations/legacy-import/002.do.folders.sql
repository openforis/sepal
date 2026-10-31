-- The schema stream runs first, so on a fresh database 003.do.folders.sql copies `project` into `folder` before
-- 001.do.import.sql has filled it. This repeats that copy after the import. Like the import, it copies only into
-- an empty target: where 003 already made the folders, users may have rearranged them, and this changes nothing.
-- It reads only this database, so it is safe where processing_recipe does not exist.
SET @copy_folders := (SELECT COUNT(*) = 0 FROM folder);

INSERT INTO folder (id, username, name, default_asset_folder, default_workspace_folder)
SELECT id, username, name, default_asset_folder, default_workspace_folder
FROM project
WHERE @copy_folders;

-- As in 003, a recipe reaches a folder only through one that exists and belongs to the same user. Everything
-- else, the empty string included, stays NULL and shows at the root.
UPDATE recipe
JOIN folder ON folder.id = recipe.project_id AND folder.username = recipe.username
SET recipe.folder_id = folder.id
WHERE @copy_folders;
