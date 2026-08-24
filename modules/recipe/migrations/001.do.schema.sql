CREATE SCHEMA IF NOT EXISTS processing_recipe;

CREATE TABLE IF NOT EXISTS processing_recipe.recipe (
  id            VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(63)  NOT NULL,
  contents      LONGTEXT     NOT NULL,
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

CREATE TABLE IF NOT EXISTS processing_recipe.project (
  id                       VARCHAR(255) NOT NULL,
  username                 VARCHAR(255) NOT NULL,
  name                     VARCHAR(255) NOT NULL,
  default_asset_folder     TEXT,
  default_workspace_folder TEXT,
  PRIMARY KEY (id),
  INDEX idx_project_1 (username, name) USING BTREE
);
