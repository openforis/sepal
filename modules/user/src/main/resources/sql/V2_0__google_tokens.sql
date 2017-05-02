ALTER TABLE sepal_user.sepal_user
  ADD COLUMN google_refresh_token VARCHAR(128) AFTER status;

ALTER TABLE sepal_user.sepal_user
  ADD COLUMN google_access_token VARCHAR(128) AFTER google_refresh_token;

ALTER TABLE sepal_user.sepal_user
  ADD COLUMN google_access_token_expiration TIMESTAMP AFTER google_access_token;
