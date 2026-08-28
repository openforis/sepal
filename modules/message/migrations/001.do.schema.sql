CREATE SCHEMA IF NOT EXISTS message;

CREATE TABLE IF NOT EXISTS message.message (
  id            VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  contents      LONGTEXT     NOT NULL,
  type          VARCHAR(63)  NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  removed       BOOLEAN      NOT NULL DEFAULT FALSE,
  priority      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_message_1 (removed, creation_time) USING BTREE
);

CREATE TABLE IF NOT EXISTS message.notification (
  message_id VARCHAR(255) NOT NULL,
  username   VARCHAR(255) NOT NULL,
  state      VARCHAR(255) NOT NULL,
  PRIMARY KEY (message_id, username),
  INDEX idx_notification_1 (username, message_id) USING BTREE
);
