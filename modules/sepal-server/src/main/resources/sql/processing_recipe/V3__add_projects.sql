ALTER TABLE processing_recipe.recipe
  ADD COLUMN project_id VARCHAR(255);

CREATE TABLE processing_recipe.project (
    id            VARCHAR(255) NOT NULL,
    username      VARCHAR(255) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
);
