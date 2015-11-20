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
DROP VIEW IF EXISTS instances_status;
DROP TABLE IF EXISTS sandboxes;
DROP TABLE IF EXISTS instance_providers;
DROP TABLE IF EXISTS datacenters;
DROP TABLE IF EXISTS instances;


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
  browseAvailable           VARCHAR(50)      DEFAULT NULL,
  browseURL                 VARCHAR(256)     DEFAULT NULL,
  sceneID                   VARCHAR(256)     DEFAULT NULL,
  sensor                    VARCHAR(50)      DEFAULT NULL,
  acquisitionDate           DATE             DEFAULT NULL,
  dateUpdated               DATE             DEFAULT NULL,
  path                      INT(11) NOT NULL,
  row                       INT(11) NOT NULL,
  geometry                  GEOMETRY         DEFAULT NULL,
  upperLeftCornerLatitude   DECIMAL(15, 12)  DEFAULT NULL,
  upperLeftCornerLongitude  DECIMAL(15, 12)  DEFAULT NULL,
  upperRightCornerLatitude  DECIMAL(15, 12)  DEFAULT NULL,
  upperRightCornerLongitude DECIMAL(15, 12)  DEFAULT NULL,
  lowerLeftCornerLatitude   DECIMAL(15, 12)  DEFAULT NULL,
  lowerLeftCornerLongitude  DECIMAL(15, 12)  DEFAULT NULL,
  lowerRightCornerLatitude  DECIMAL(15, 12)  DEFAULT NULL,
  lowerRightCornerLongitude DECIMAL(15, 12)  DEFAULT NULL,
  sceneCenterLatitude       DECIMAL(15, 12)  DEFAULT NULL,
  sceneCenterLongitude      DECIMAL(15, 12)  DEFAULT NULL,
  cloudCover                INT(11)          DEFAULT NULL,
  cloudCoverFull            FLOAT            DEFAULT NULL,
  dayOrNight                VARCHAR(50)      DEFAULT NULL,
  sunElevation              VARCHAR(256)     DEFAULT NULL,
  sunAzimuth                VARCHAR(256)     DEFAULT NULL,
  receivingStation          VARCHAR(256)     DEFAULT NULL,
  sceneStartTime            DATETIME         DEFAULT NULL,
  sceneStopTime             DATETIME         DEFAULT NULL,
  imageQuality1             INT(11)          DEFAULT NULL,
  DATA_TYPE_L1              VARCHAR(256)     DEFAULT NULL,
  cartURL                   VARCHAR(256)     DEFAULT NULL,
  GEOMETRIC_RMSE_MODEL_X    VARCHAR(256)     DEFAULT NULL,
  GEOMETRIC_RMSE_MODEL_Y    VARCHAR(256)     DEFAULT NULL,
  FULL_PARTIAL_SCENE        VARCHAR(256)     DEFAULT NULL,
  tiffavailability          VARCHAR(256)     DEFAULT NULL,
  tiffverification          VARCHAR(256)     DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX idx_usgs_data_repo_1 ON usgs_data_repo (dataset_id);
CREATE INDEX idx_usgs_data_repo_2 ON usgs_data_repo (sceneID);
CREATE INDEX idx_usgs_data_repo_3 ON usgs_data_repo (sensor);
CREATE INDEX idx_usgs_data_repo_4 ON usgs_data_repo (path);
CREATE INDEX idx_usgs_data_repo_5 ON usgs_data_repo (row);
CREATE INDEX idx_usgs_data_repo_6 ON usgs_data_repo (cloudCoverFull);
CREATE INDEX idx_usgs_data_repo_7 ON usgs_data_repo (dataset_id, acquisitionDate);

CREATE TABLE wrs_points (
  id                  INT(11)         NOT NULL AUTO_INCREMENT,
  path                INT(11)         NOT NULL,
  row                 INT(11)         NOT NULL,
  centreLongitude     DECIMAL(15, 12) NOT NULL,
  centreLatitude      DECIMAL(15, 12) NOT NULL,
  upperLeftLongitude  DECIMAL(15, 12) NOT NULL,
  upperLeftLatitude   DECIMAL(15, 12) NOT NULL,
  lowerLeftLongitude  DECIMAL(15, 12) NOT NULL,
  lowerLeftLatitude   DECIMAL(15, 12) NOT NULL,
  lowerRightLongitude DECIMAL(15, 12) NOT NULL,
  lowerRightLatitude  DECIMAL(15, 12) NOT NULL,
  upperRightLongitude DECIMAL(15, 12) NOT NULL,
  upperRightLatitude  DECIMAL(15, 12) NOT NULL,
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

ALTER TABLE download_requests ADD CONSTRAINT uc_user_req_name UNIQUE (username, request_name);


CREATE TABLE requested_scenes (
  id               INT(11)      NOT NULL AUTO_INCREMENT,
  request_id       INT(11)      NOT NULL,
  scene_id         VARCHAR(255) NOT NULL,
  dataset_id       INT(11)      NOT NULL,
  last_updated     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status           VARCHAR(255) NOT NULL DEFAULT 'REQUESTED',
  processing_chain VARCHAR(255),
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`)
);

CREATE TABLE metadata_crawling_criteria (
  criteria_id          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  metadata_provider_id INT(10) UNSIGNED NOT NULL,
  field_name           VARCHAR(255)     NOT NULL,
  expected_value       VARCHAR(255)     NOT NULL,
  PRIMARY KEY (`criteria_id`)
);

CREATE TABLE sandboxes (
  sandbox_id          INT          NOT NULL AUTO_INCREMENT,
  username            VARCHAR(255) NOT NULL,
  status              VARCHAR(255) NOT NULL DEFAULT 'CREATED',
  container_id        VARCHAR(255) NULL,
  uri                 VARCHAR(255) NULL,
  created_on          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminated_on       TIMESTAMP    NULL,
  status_refreshed_on TIMESTAMP    NULL,
  instance_id INT(11) NOT NULL,
  size INT(2)  NOT NULL,
  PRIMARY KEY (sandbox_id)
);

CREATE TABLE instance_providers (
  id            INT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(60) NOT NULL,
  description   VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE datacenters (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  geolocation VARCHAR(60) NOT NULL,
  description   VARCHAR(255) NOT NULL,
  provider_id INT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE instances (
  id INT NOT NULL AUTO_INCREMENT,
  status VARCHAR(60) NOT NULL,
  public_ip VARCHAR(60) NOT NULL,
  private_ip VARCHAR(60) NOT NULL,
  owner VARCHAR(255) NULL,
  name VARCHAR(60) NOT NULL,
  launch_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  termination_time DATETIME NULL,
  status_update_time DATETIME NOT NULL,
  disposable INT(1) NOT NULL DEFAULT 1,
  reserved INT(1) NOT NULL DEFAULT 1,
  data_center_id INT NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);

CREATE OR REPLACE VIEW instances_status AS SELECT ic.id AS instanceId, COALESCE((SELECT SUM(size) FROM sandboxes WHERE status <> 'TERMINATED' AND instance_id = ic.id),0) AS totalOccupied,ic.id AS instanceIdentifier,ic.capacity AS instanceCapacity,ic.capacity - COALESCE((SELECT SUM(size) FROM sandboxes WHERE status <> 'TERMINATED' AND instance_id = ic.id),0) AS remaining,ic.data_center_id AS dataCenterId, ic.status AS instanceStatus,ic.reserved AS instanceReserved,ic.owner AS instanceOwner FROM instances ic ORDER BY remaining asc;





