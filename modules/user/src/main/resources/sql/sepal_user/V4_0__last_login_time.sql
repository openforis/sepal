ALTER TABLE sepal_user.sepal_user
  ADD COLUMN last_login_time TIMESTAMP;

UPDATE sepal_user.sepal_user
SET last_login_time = update_time;

ALTER TABLE sepal_user.sepal_user
  MODIFY last_login_time TIMESTAMP NOT NULL;
