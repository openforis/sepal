-- The version optimistic locking checks: every write that changes the record bumps it (see
-- userRepository.js). UNSIGNED INT stays inside a JavaScript safe integer.

ALTER TABLE sepal_user ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1;
