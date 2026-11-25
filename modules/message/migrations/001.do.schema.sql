CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS message (
  id            varchar(36)  NOT NULL,
  username      citext       NOT NULL CHECK (char_length(username) <= 32),
  subject       varchar(255) NOT NULL,
  contents      text         NOT NULL,
  type          varchar(63)  NOT NULL,
  creation_time timestamptz(0) NOT NULL,
  update_time   timestamptz(0) NOT NULL,
  removed       boolean      NOT NULL DEFAULT FALSE,
  priority      integer      NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE INDEX message_idx_message_1 ON message (removed, creation_time);

CREATE TABLE IF NOT EXISTS notification (
  message_id varchar(36) NOT NULL,
  username   citext      NOT NULL CHECK (char_length(username) <= 32),
  state      varchar(16) NOT NULL,
  PRIMARY KEY (message_id, username)
);

CREATE INDEX notification_idx_notification_1 ON notification (username, message_id);
