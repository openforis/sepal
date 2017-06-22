CREATE SCHEMA IF NOT EXISTS processing_recipe;

CREATE TABLE processing_recipe.recipe (
  id            VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(63)  NOT NULL,
  contents      LONGTEXT     NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  removed       BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id)
);