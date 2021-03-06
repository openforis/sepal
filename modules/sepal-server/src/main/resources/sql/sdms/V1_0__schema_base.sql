CREATE SCHEMA IF NOT EXISTS sdms;

CREATE TABLE groups (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  group_desc TEXT        NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE groups_system (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE restricted_group (
  id   INT(11) NOT NULL AUTO_INCREMENT,
  name VARCHAR(100)     DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE roles (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  role_name  VARCHAR(50) NOT NULL,
  role_desc  TEXT        NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE users (
  id             INT(11)     NOT NULL AUTO_INCREMENT,
  username       VARCHAR(50) NOT NULL,
  full_name      VARCHAR(100)         DEFAULT NULL,
  email          VARCHAR(50)          DEFAULT NULL,
  remember_token VARCHAR(256)         DEFAULT NULL,
  permissions    TEXT,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP   NULL     DEFAULT NULL,
  user_uid       INTEGER     NOT NULL DEFAULT 0,
  is_system_user TINYINT(4),
  PRIMARY KEY (id)
);

CREATE TABLE users_groups (
  id             INT(11)     NOT NULL AUTO_INCREMENT,
  user_id        INT(11)     NOT NULL,
  group_id       VARCHAR(50) NOT NULL,
  is_group_admin TINYINT(4)  NOT NULL,
  created_by     INT(11)     NOT NULL,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE users_roles (
  id         INT(11)   NOT NULL AUTO_INCREMENT,
  user_id    INT(11)   NOT NULL,
  role_id    INT(11)   NOT NULL,
  created_by INT(11)   NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE sandbox_session (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(255) NOT NULL,
  instance_id   VARCHAR(255),
  instance_type VARCHAR(255) NOT NULL,
  host          VARCHAR(255),
  port          INT,
  status        VARCHAR(255) NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE user_budget (
  username         VARCHAR(255) NOT NULL,
  monthly_instance INT          NOT NULL,
  monthly_storage  INT          NOT NULL,
  storage_quota    INT          NOT NULL,
  PRIMARY KEY (username)
);

CREATE TABLE default_user_budget (
  monthly_instance INT NOT NULL,
  monthly_storage  INT NOT NULL,
  storage_quota    INT NOT NULL
);

CREATE TABLE user_monthly_storage (
  username     VARCHAR(255) NOT NULL,
  year         INT          NOT NULL,
  month        INT          NOT NULL,
  gb_hours     DOUBLE       NOT NULL,
  storage_used DOUBLE       NOT NULL,
  update_time  TIMESTAMP    NOT NULL,
  PRIMARY KEY (username, year, month)
);

CREATE INDEX idx_user_monthly_storage_1
  ON user_monthly_storage (username, year, month);

CREATE TABLE scene_meta_data (
  id               VARCHAR(255) NOT NULL,
  meta_data_source VARCHAR(255) NOT NULL,
  sensor_id        VARCHAR(255) NOT NULL,
  scene_area_id    VARCHAR(255) NOT NULL,
  acquisition_date DATETIME     NOT NULL,
  cloud_cover      DOUBLE       NOT NULL,
  sun_azimuth      DOUBLE       NOT NULL,
  sun_elevation    DOUBLE       NOT NULL,
  browse_url       VARCHAR(255) NOT NULL,
  update_time      TIMESTAMP    NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX idx_scene_meta_data_1
  ON scene_meta_data (scene_area_id, acquisition_date);
CREATE INDEX idx_scene_meta_data_2
  ON scene_meta_data (meta_data_source, sensor_id, update_time);


CREATE TABLE worker_session (
  id            VARCHAR(255) NOT NULL,
  state         VARCHAR(255) NOT NULL,
  username      VARCHAR(255) NOT NULL,
  worker_type   VARCHAR(255) NOT NULL,
  instance_type VARCHAR(255) NOT NULL,
  instance_id   VARCHAR(255) NOT NULL,
  host          VARCHAR(255) NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE task (
  id                 VARCHAR(255) NOT NULL,
  state              VARCHAR(255) NOT NULL,
  username           VARCHAR(255) NOT NULL,
  session_id         VARCHAR(255) NOT NULL,
  operation          VARCHAR(255) NOT NULL,
  params             TEXT         NOT NULL,
  status_description VARCHAR(255) NOT NULL,
  creation_time      TIMESTAMP    NOT NULL,
  update_time        TIMESTAMP    NOT NULL,
  removed            BOOLEAN      NOT NULL,
  PRIMARY KEY (id)
);

CREATE VIEW instance_use AS
  SELECT
    username,
    state,
    instance_type,
    creation_time,
    update_time
  FROM worker_session;

INSERT INTO groups_system (id, group_name) VALUES (46, 'admin');

INSERT INTO roles (id, role_name, role_desc) VALUES (1, 'application_admin', 'Application Administrator');
INSERT INTO roles (id, role_name, role_desc) VALUES (2, 'task_executor', 'Task Executor');

INSERT INTO users (id, username, full_name, user_uid) VALUES (1, 'admin', 'admin', 1001);
INSERT INTO users (id, username, full_name, user_uid, is_system_user)
VALUES (2, 'sepalAdmin', 'Administrator', 1002, 1);
INSERT INTO users_roles (user_id, role_id, created_by) VALUES (2, 1, 2);
INSERT INTO users_roles (user_id, role_id, created_by) VALUES (1, 1, 2);
INSERT INTO users_roles (user_id, role_id, created_by) VALUES (2, 2, 2);
INSERT INTO user_budget (username, monthly_instance, monthly_storage, storage_quota) VALUES ('admin', 10, 10, 100);
INSERT INTO default_user_budget (monthly_instance, monthly_storage, storage_quota) VALUES (10, 10, 100);
