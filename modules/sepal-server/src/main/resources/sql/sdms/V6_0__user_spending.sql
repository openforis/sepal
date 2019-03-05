CREATE TABLE IF NOT EXISTS user_spending
(
  username          VARCHAR(255) NOT NULL,
  instance_spending DOUBLE  NOT NULL DEFAULT 0,
  storage_spending  DOUBLE  NOT NULL DEFAULT 0,
  storage_usage     DOUBLE  NOT NULL DEFAULT 0,
  PRIMARY KEY (username)
);
