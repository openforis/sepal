-- Recipe schema.
-- COPIES the recipe + project tables from the legacy `processing_recipe` schema. The original is
-- LEFT INTACT as a rollback safety net: the copy is read-only and guarded (copy only if the source
-- exists AND the target is still empty), so it is idempotent and dropping the `recipe` schema fully
-- reverts this module.
-- Columns are listed explicitly rather than copied with SELECT *, so the copy does not depend on
-- the legacy schema's column order.
-- Soft-deleted recipes are NOT copied: `removed` rows are invisible to every read path, so they
-- would only ever be dead weight in the new schema. The column itself stays, because removal
-- after the migration is still a soft delete.
-- Usernames are lowercased on the way in: the legacy tables stored them as typed, while
-- `sepal_user` is uniformly lowercase and every read path lowercases anyway.
-- The shared migration runner executes the whole file as one multi-statement query, so the
-- session @vars + PREPARE/EXECUTE persist across statements.

CREATE SCHEMA IF NOT EXISTS recipe;

CREATE TABLE IF NOT EXISTS recipe.recipe (
  id            VARCHAR(36)  NOT NULL,
  username      VARCHAR(32)  NOT NULL,
  name          VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  type          VARCHAR(63)  NOT NULL,
  contents      LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  removed       BOOLEAN      NOT NULL DEFAULT FALSE,
  type_version  INT          DEFAULT 1,
  project_id    VARCHAR(255),
  PRIMARY KEY (id),
  INDEX idx_recipe_1 (username, removed, name, update_time) USING BTREE,
  INDEX idx_recipe_2 (type, type_version, removed, creation_time) USING BTREE,
  INDEX idx_recipe_3 (username, project_id) USING BTREE
);

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='processing_recipe' AND TABLE_NAME='recipe')
    AND (SELECT COUNT(*) FROM recipe.recipe)=0,
    'INSERT INTO recipe.recipe (id, username, name, type, contents, creation_time, update_time, removed, type_version, project_id) SELECT id, LOWER(username), name, type, contents, creation_time, update_time, removed, type_version, project_id FROM processing_recipe.recipe WHERE removed = FALSE',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

CREATE TABLE IF NOT EXISTS recipe.project (
  id                       VARCHAR(36)  NOT NULL,
  username                 VARCHAR(32)  NOT NULL,
  name                     VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  default_asset_folder     TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  default_workspace_folder TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  PRIMARY KEY (id),
  INDEX idx_project_1 (username, name) USING BTREE
);

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='processing_recipe' AND TABLE_NAME='project')
    AND (SELECT COUNT(*) FROM recipe.project)=0,
    'INSERT INTO recipe.project (id, username, name, default_asset_folder, default_workspace_folder) SELECT id, LOWER(username), name, default_asset_folder, default_workspace_folder FROM processing_recipe.project',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
