-- Undo migration for the user schema.
-- NOTE: Does NOT move data back to sepal_user; the original is never modified.

DROP TABLE IF EXISTS user.`sepal_user`;
