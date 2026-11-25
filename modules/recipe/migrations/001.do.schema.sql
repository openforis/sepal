CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS recipe (
  id            varchar(36)    NOT NULL,
  username      citext         NOT NULL CHECK (char_length(username) <= 32),
  name          varchar(255)   NOT NULL,
  type          varchar(63)    NOT NULL,
  contents      jsonb          NOT NULL,
  creation_time timestamptz(0) NOT NULL,
  update_time   timestamptz(0) NOT NULL,
  removed       boolean        NOT NULL DEFAULT FALSE,
  type_version  integer        DEFAULT 1,
  project_id    varchar(255),
  revision      integer        NOT NULL DEFAULT 1 CHECK (revision >= 0),
  PRIMARY KEY (id)
);

CREATE INDEX recipe_idx_recipe_1 ON recipe (username, removed, name, update_time);
CREATE INDEX recipe_idx_recipe_2 ON recipe (type, type_version, removed, creation_time);
CREATE INDEX recipe_idx_recipe_3 ON recipe (username, project_id);

CREATE TABLE IF NOT EXISTS project (
  id                       varchar(36)  NOT NULL,
  username                 citext       NOT NULL CHECK (char_length(username) <= 32),
  name                     varchar(255) NOT NULL,
  default_asset_folder     text,
  default_workspace_folder text,
  PRIMARY KEY (id)
);

CREATE INDEX project_idx_project_1 ON project (username, name);
