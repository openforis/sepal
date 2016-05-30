DROP TABLE IF EXISTS admin_groups;
DROP TABLE IF EXISTS config_details;
DROP TABLE IF EXISTS data_set;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS groups_system;
DROP TABLE IF EXISTS image_log;
DROP TABLE IF EXISTS restricted_group;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS temp_download_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS users_groups;
DROP TABLE IF EXISTS users_roles;
DROP TABLE IF EXISTS usgs_data_repo;
DROP TABLE IF EXISTS wrs_points;
DROP TABLE IF EXISTS download_requests;
DROP TABLE IF EXISTS requested_scenes;
DROP TABLE IF EXISTS metadata_providers;
DROP TABLE IF EXISTS metadata_crawling_criteria;
DROP TABLE IF EXISTS instance_providers;
DROP TABLE IF EXISTS datacenters;
DROP TABLE IF EXISTS instances;
DROP TABLE IF EXISTS sandbox_session;
DROP TABLE IF EXISTS user_budget;
DROP TABLE IF EXISTS user_monthly_storage;
DROP TABLE IF EXISTS scene_meta_data;
DROP TABLE IF EXISTS old_task;

DROP TABLE IF EXISTS worker_session;
DROP TABLE IF EXISTS task;

CREATE TABLE admin_groups (
  id         INT(10)      NOT NULL,
  user_id    INT(10)      NOT NULL,
  group_id   VARCHAR(100) NOT NULL,
  created_by INT(10)      NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT '0000-01-01 00:00:00',
  updated_at TIMESTAMP    NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE INDEX idx_admin_groups_1 ON admin_groups (user_id);

CREATE TABLE config_details (
  name  VARCHAR(50) NOT NULL,
  value VARCHAR(50) NOT NULL
);

CREATE TABLE data_set (
  id                INT(11)     NOT NULL AUTO_INCREMENT,
  dataset_name      VARCHAR(50) NOT NULL,
  dataset_value     VARCHAR(50) NOT NULL,
  dataset_active    TINYINT(1)  NOT NULL,
  metadata_provider INT(11)     NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);

CREATE TABLE groups (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  group_desc TEXT        NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE TABLE groups_system (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP   NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE TABLE image_log (
  id            INT(11)      NOT NULL AUTO_INCREMENT,
  name          VARCHAR(256) NOT NULL,
  downloaded_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME,
  accessed_by   VARCHAR(50),
  deleted       INT(11)      NOT NULL DEFAULT 0,
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
  updated_at TIMESTAMP   NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE TABLE temp_download_log (
  id         BIGINT(20)   NOT NULL AUTO_INCREMENT,
  username   VARCHAR(200) NOT NULL,
  filepath   VARCHAR(200) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT '0000-01-01 00:00:00',
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
  updated_at     TIMESTAMP   NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE TABLE users_roles (
  id         INT(11)   NOT NULL AUTO_INCREMENT,
  user_id    INT(11)   NOT NULL,
  role_id    INT(11)   NOT NULL,
  created_by INT(11)   NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT '0000-01-01 00:00:00',
  PRIMARY KEY (id)
);

CREATE TABLE usgs_data_repo (
  id                        INT(50) NOT NULL AUTO_INCREMENT,
  dataset_id                INT(50) NOT NULL,
  browseavailable           VARCHAR(50)      DEFAULT NULL,
  browseurl                 VARCHAR(256)     DEFAULT NULL,
  sceneid                   VARCHAR(256)     DEFAULT NULL,
  sensor                    VARCHAR(50)      DEFAULT NULL,
  acquisitiondate           DATE             DEFAULT NULL,
  dateupdated               DATE             DEFAULT NULL,
  path                      INT(11) NOT NULL,
  row                       INT(11) NOT NULL,
  geometry                  GEOMETRY         DEFAULT NULL,
  upperleftcornerlatitude   DECIMAL(15, 12)  DEFAULT NULL,
  upperleftcornerlongitude  DECIMAL(15, 12)  DEFAULT NULL,
  upperrightcornerlatitude  DECIMAL(15, 12)  DEFAULT NULL,
  upperrightcornerlongitude DECIMAL(15, 12)  DEFAULT NULL,
  lowerleftcornerlatitude   DECIMAL(15, 12)  DEFAULT NULL,
  lowerleftcornerlongitude  DECIMAL(15, 12)  DEFAULT NULL,
  lowerrightcornerlatitude  DECIMAL(15, 12)  DEFAULT NULL,
  lowerrightcornerlongitude DECIMAL(15, 12)  DEFAULT NULL,
  scenecenterlatitude       DECIMAL(15, 12)  DEFAULT NULL,
  scenecenterlongitude      DECIMAL(15, 12)  DEFAULT NULL,
  cloudcover                INT(11)          DEFAULT NULL,
  cloudcoverfull            FLOAT            DEFAULT NULL,
  dayornight                VARCHAR(50)      DEFAULT NULL,
  sunelevation              VARCHAR(256)     DEFAULT NULL,
  sunazimuth                VARCHAR(256)     DEFAULT NULL,
  receivingstation          VARCHAR(256)     DEFAULT NULL,
  scenestarttime            DATETIME         DEFAULT NULL,
  scenestoptime             DATETIME         DEFAULT NULL,
  imagequality1             INT(11)          DEFAULT NULL,
  data_type_l1              VARCHAR(256)     DEFAULT NULL,
  carturl                   VARCHAR(256)     DEFAULT NULL,
  geometric_rmse_model_x    VARCHAR(256)     DEFAULT NULL,
  geometric_rmse_model_y    VARCHAR(256)     DEFAULT NULL,
  full_partial_scene        VARCHAR(256)     DEFAULT NULL,
  tiffavailability          VARCHAR(256)     DEFAULT NULL,
  tiffverification          VARCHAR(256)     DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX idx_usgs_data_repo_1 ON usgs_data_repo (dataset_id);
CREATE INDEX idx_usgs_data_repo_2 ON usgs_data_repo (sceneid);
CREATE INDEX idx_usgs_data_repo_3 ON usgs_data_repo (sensor);
CREATE INDEX idx_usgs_data_repo_4 ON usgs_data_repo (path);
CREATE INDEX idx_usgs_data_repo_5 ON usgs_data_repo (row);
CREATE INDEX idx_usgs_data_repo_6 ON usgs_data_repo (cloudcoverfull);
CREATE INDEX idx_usgs_data_repo_7 ON usgs_data_repo (dataset_id, acquisitiondate);

CREATE TABLE wrs_points (
  id                  INT(11)         NOT NULL AUTO_INCREMENT,
  path                INT(11)         NOT NULL,
  row                 INT(11)         NOT NULL,
  centrelongitude     DECIMAL(15, 12) NOT NULL,
  centrelatitude      DECIMAL(15, 12) NOT NULL,
  upperleftlongitude  DECIMAL(15, 12) NOT NULL,
  upperleftlatitude   DECIMAL(15, 12) NOT NULL,
  lowerleftlongitude  DECIMAL(15, 12) NOT NULL,
  lowerleftlatitude   DECIMAL(15, 12) NOT NULL,
  lowerrightlongitude DECIMAL(15, 12) NOT NULL,
  lowerrightlatitude  DECIMAL(15, 12) NOT NULL,
  upperrightlongitude DECIMAL(15, 12) NOT NULL,
  upperrightlatitude  DECIMAL(15, 12) NOT NULL,
  PRIMARY KEY (id)
);


CREATE TABLE download_requests (
  request_id     INT(11)      NOT NULL AUTO_INCREMENT,
  request_time   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  username       VARCHAR(255) NOT NULL,
  group_scenes   INT(1)       NOT NULL DEFAULT 0,
  request_name   VARCHAR(255),
  request_status VARCHAR(255) NOT NULL DEFAULT 'REQUESTED',
  PRIMARY KEY (request_id)
);

ALTER TABLE download_requests
  ADD CONSTRAINT uc_user_req_name UNIQUE (username, request_name);


CREATE TABLE requested_scenes (
  id               INT(11)      NOT NULL AUTO_INCREMENT,
  request_id       INT(11)      NOT NULL,
  scene_id         VARCHAR(255) NOT NULL,
  dataset_id       INT(11)      NOT NULL,
  last_updated     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status           VARCHAR(255) NOT NULL DEFAULT 'REQUESTED',
  processing_chain VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE TABLE metadata_providers (
  id                   INT(11) UNSIGNED NOT NULL,
  name                 VARCHAR(45)      NOT NULL,
  active               TINYINT(1)       NOT NULL DEFAULT '1',
  crawling_entrypoint  VARCHAR(255)     NOT NULL,
  iterations           INT(10)                   DEFAULT 4,
  iteration_size       INT(10)                   DEFAULT 18,
  last_execution_start DATETIME                  DEFAULT NULL,
  last_execution_end   DATETIME                  DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE metadata_crawling_criteria (
  criteria_id          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  metadata_provider_id INT(10) UNSIGNED NOT NULL,
  field_name           VARCHAR(255)     NOT NULL,
  expected_value       VARCHAR(255)     NOT NULL,
  PRIMARY KEY (criteria_id)
);

CREATE TABLE instance_providers (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE datacenters (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60)  NOT NULL,
  geolocation VARCHAR(60)  NOT NULL,
  description VARCHAR(255) NOT NULL,
  provider_id INT          NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE instances (
  id                 INT          NOT NULL AUTO_INCREMENT,
  instance_type      INT          NOT NULL,
  status             VARCHAR(60)  NOT NULL,
  public_ip          VARCHAR(60)  NULL,
  private_ip         VARCHAR(60)  NOT NULL,
  owner              VARCHAR(255) NULL,
  name               VARCHAR(60)  NOT NULL,
  launch_time        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_update_time DATETIME     NOT NULL,
  disposable         INT(1)       NOT NULL DEFAULT 1,
  reserved           INT(1)       NOT NULL DEFAULT 1,
  data_center_id     INT          NOT NULL,
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

CREATE TABLE user_monthly_storage (
  username     VARCHAR(255) NOT NULL,
  year         INT          NOT NULL,
  month        INT          NOT NULL,
  gb_hours     DOUBLE       NOT NULL,
  storage_used DOUBLE       NOT NULL,
  update_time  TIMESTAMP    NOT NULL,
  PRIMARY KEY (username, year, month)
);

CREATE INDEX idx_user_monthly_storage_1 ON user_monthly_storage (username, year, month);

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
  PRIMARY KEY (id, meta_data_source)
);

CREATE TABLE old_task (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(255) NOT NULL,
  state         VARCHAR(255) NOT NULL,
  instance_id   VARCHAR(255) NOT NULL,
  operation     VARCHAR(255) NOT NULL,
  data          VARCHAR(255) NOT NULL,
  creation_time TIMESTAMP    NOT NULL,
  update_time   TIMESTAMP    NOT NULL,
  PRIMARY KEY (id)
);

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
  id                 VARCHAR(255)  NOT NULL,
  state              VARCHAR(255)  NOT NULL,
  username           VARCHAR(255)  NOT NULL,
  session_id         VARCHAR(255)  NOT NULL,
  operation          VARCHAR(255)  NOT NULL,
  params             VARCHAR(2048) NOT NULL,
  status_description VARCHAR(255)  NOT NULL,
  creation_time      TIMESTAMP     NOT NULL,
  update_time        TIMESTAMP     NOT NULL,
  removed            BOOLEAN       NOT NULL,
  PRIMARY KEY (id)
);


CREATE INDEX idx_scene_meta_data_1 ON scene_meta_data (meta_data_source, scene_area_id, acquisition_date);
CREATE INDEX idx_scene_meta_data_2 ON scene_meta_data (meta_data_source, update_time);