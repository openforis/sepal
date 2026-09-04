-- UNSIGNED INT stays inside a JavaScript safe integer, so a revision needs no string handling on the wire.

ALTER TABLE recipe.recipe ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1;
