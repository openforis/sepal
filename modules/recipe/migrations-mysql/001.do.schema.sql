CREATE TABLE IF NOT EXISTS recipe (
  id            VARCHAR(36)  NOT NULL,
  username      VARCHAR(32)  COLLATE ascii_general_ci NOT NULL,
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

CREATE TABLE IF NOT EXISTS project (
  id                       VARCHAR(36)  NOT NULL,
  username                 VARCHAR(32)  COLLATE ascii_general_ci NOT NULL,
  name                     VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  default_asset_folder     TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  default_workspace_folder TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  PRIMARY KEY (id),
  INDEX idx_project_1 (username, name) USING BTREE
);
