-- Undo migration for the recipe schema.
-- Drops all tables created in 001.do.schema.sql.
-- NOTE: Does NOT move data back to processing_recipe; the original is never modified.

DROP TABLE IF EXISTS recipe.project;
DROP TABLE IF EXISTS recipe.recipe;
