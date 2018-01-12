CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE notification.message (
  id            VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  contents      LONGTEXT NOT NULL,
  type          VARCHAR(63)  NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  removed       BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id)
);

CREATE TABLE notification.notification (
  message_id    VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  state         VARCHAR(255) NOT NULL,
  PRIMARY KEY (message_id, username)
);