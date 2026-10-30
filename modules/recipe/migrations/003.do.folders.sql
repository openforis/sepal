-- `project` and `recipe.project_id` stay: the legacy import reads `project`, and a statement naming a
-- table that is not there fails whether or not its condition holds. They go once that import is removed.
CREATE TABLE IF NOT EXISTS folder (
  id                       VARCHAR(36)  NOT NULL,
  username                 VARCHAR(32)  COLLATE ascii_general_ci NOT NULL,
  name                     VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  parent_id                VARCHAR(36),
  default_asset_folder     TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  default_workspace_folder TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  PRIMARY KEY (id),
  INDEX idx_folder_1 (username, name) USING BTREE,
  INDEX idx_folder_2 (username, parent_id) USING BTREE
);

INSERT INTO folder (id, username, name, default_asset_folder, default_workspace_folder)
SELECT id, username, name, default_asset_folder, default_workspace_folder
FROM project;

ALTER TABLE recipe
  ADD COLUMN folder_id VARCHAR(36) NULL,
  ADD INDEX idx_recipe_4 (username, folder_id) USING BTREE;

-- A recipe reaches a folder only through one that exists and belongs to the same user. Everything else,
-- the empty string included, stays NULL and shows at the root.
UPDATE recipe
JOIN folder ON folder.id = recipe.project_id AND folder.username = recipe.username
SET recipe.folder_id = folder.id;
