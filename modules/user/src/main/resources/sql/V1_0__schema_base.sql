CREATE SCHEMA IF NOT EXISTS sepal_user;

CREATE TABLE sepal_user.sepal_user (
  id                    INT(11)     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username              VARCHAR(32) NOT NULL,
  name                  VARCHAR(1000),
  email                 VARCHAR(1000),
  organization          VARCHAR(1000),
  token                 VARCHAR(256),
  admin                 BOOLEAN     NOT NULL,
  system_user           BOOLEAN     NOT NULL,
  status                VARCHAR(32) NOT NULL,
  creation_time         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  token_generation_time TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
)
  AUTO_INCREMENT = 10000;

CREATE TABLE sepal_user.rmb_message (
  id               VARCHAR(127)    NOT NULL,
  sequence_no      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  publication_time TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queue_id         VARCHAR(127)    NOT NULL,
  message_string   TEXT,
  message_bytes    BLOB,
  PRIMARY KEY (id)
);

CREATE TABLE sepal_user.rmb_message_processing (
  message_id    VARCHAR(127) NOT NULL,
  consumer_id   VARCHAR(127) NOT NULL,
  version_id    VARCHAR(127) NOT NULL,
  state         VARCHAR(32)  NOT NULL,
  last_updated  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  times_out     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retries       INT          NOT NULL,
  error_message TEXT,
  PRIMARY KEY (message_id, consumer_id),
  FOREIGN KEY (message_id) REFERENCES sepal_user.rmb_message (id)
);

INSERT INTO sepal_user.sepal_user (username, admin, system_user, status) VALUES ('sepalAdmin', TRUE, TRUE, 'ACTIVE');
INSERT INTO sepal_user.sepal_user (username, admin, system_user, status) VALUES ('admin', TRUE, FALSE, 'ACTIVE');