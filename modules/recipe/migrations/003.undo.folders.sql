ALTER TABLE recipe
  DROP INDEX idx_recipe_4,
  DROP COLUMN folder_id;

DROP TABLE IF EXISTS folder;
