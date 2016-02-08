CREATE TABLE admin_groups (
  id         INT(10)      NOT NULL,
  user_id    INT(10)      NOT NULL,
  group_id   VARCHAR(100) NOT NULL,
  created_by INT(10)      NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  name VARCHAR(100),
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

CREATE TABLE temp_download_log (
  id         BIGINT(20)   NOT NULL AUTO_INCREMENT,
  username   VARCHAR(200) NOT NULL,
  filepath   VARCHAR(200) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE users (
  id             INT(11)     NOT NULL AUTO_INCREMENT,
  username       VARCHAR(50) NOT NULL,
  full_name      VARCHAR(100),
  email          VARCHAR(50),
  remember_token VARCHAR(256),
  permissions    TEXT,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP   NULL,
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

CREATE TABLE usgs_data_repo (
  id                        INT(50) NOT NULL AUTO_INCREMENT,
  dataset_id                INT(50) NOT NULL,
  browseAvailable           VARCHAR(50),
  browseURL                 VARCHAR(256),
  sceneID                   VARCHAR(256),
  sensor                    VARCHAR(50),
  acquisitionDate           DATE,
  dateUpdated               DATE,
  path                      INT(11) NOT NULL,
  row                       INT(11) NOT NULL,
  geometry                  GEOMETRY,
  upperLeftCornerLatitude   DECIMAL(15, 12),
  upperLeftCornerLongitude  DECIMAL(15, 12),
  upperRightCornerLatitude  DECIMAL(15, 12),
  upperRightCornerLongitude DECIMAL(15, 12),
  lowerLeftCornerLatitude   DECIMAL(15, 12),
  lowerLeftCornerLongitude  DECIMAL(15, 12),
  lowerRightCornerLatitude  DECIMAL(15, 12),
  lowerRightCornerLongitude DECIMAL(15, 12),
  sceneCenterLatitude       DECIMAL(15, 12),
  sceneCenterLongitude      DECIMAL(15, 12),
  cloudCover                INT(11),
  cloudCoverFull            FLOAT,
  dayOrNight                VARCHAR(50),
  sunElevation              VARCHAR(256),
  sunAzimuth                VARCHAR(256),
  receivingStation          VARCHAR(256),
  sceneStartTime            DATETIME,
  sceneStopTime             DATETIME,
  imageQuality1             INT(11),
  DATA_TYPE_L1              VARCHAR(256),
  cartURL                   VARCHAR(256),
  GEOMETRIC_RMSE_MODEL_X    VARCHAR(256),
  GEOMETRIC_RMSE_MODEL_Y    VARCHAR(256),
  FULL_PARTIAL_SCENE        VARCHAR(256),
  tiffavailability          VARCHAR(256),
  tiffverification          VARCHAR(256),
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
  last_execution_start DATETIME,
  last_execution_end   DATETIME,
  PRIMARY KEY (`id`)
);

CREATE TABLE metadata_crawling_criteria (
  criteria_id          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  metadata_provider_id INT(10) UNSIGNED NOT NULL,
  field_name           VARCHAR(255)     NOT NULL,
  expected_value       VARCHAR(255)     NOT NULL,
  PRIMARY KEY (`criteria_id`)
);

CREATE TABLE sandbox_sessions (
  session_id          INT          NOT NULL AUTO_INCREMENT,
  username            VARCHAR(255) NOT NULL,
  status              VARCHAR(255) NOT NULL DEFAULT 'CREATED',
  container_id        VARCHAR(255) NULL,
  container_uri       VARCHAR(255) NULL,
  created_on          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminated_on       TIMESTAMP    NULL,
  status_refreshed_on TIMESTAMP    NULL,
  instance_id         INT(11)      NOT NULL,
  PRIMARY KEY (session_id)
);

CREATE TABLE sandbox_session (
  id               INT          NOT NULL AUTO_INCREMENT,
  username         VARCHAR(255) NOT NULL,
  instance_id      VARCHAR(255),
  instance_type    VARCHAR(255) NOT NULL,
  host             VARCHAR(255),
  port             INT,
  status           VARCHAR(255) NOT NULL,
  creation_time    TIMESTAMP    NOT NULL,
  update_time      TIMESTAMP    NOT NULL,
  termination_time TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE user_budget (
  username         VARCHAR(255) NOT NULL,
  monthly_instance INT          NOT NULL
);


INSERT INTO config_details VALUES ('cron_delay_days', '50');

INSERT INTO data_set (dataset_name, dataset_value, dataset_active) VALUES ('Landsat 8 OLI/TIRS', 'LANDSAT_8', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active)
VALUES ('Landsat 7 SLC-off (2003 ->)', 'LANDSAT_ETM_SLC_OFF', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active)
VALUES ('Landsat 7 SLC-on (1999-2003)', 'LANDSAT_ETM', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active) VALUES ('Landsat 4-5 TM', 'LANDSAT_TM', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active) VALUES ('Landsat 4-5 MSS', 'LANDSAT_MSS', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active) VALUES ('Landsat 1-3 MSS', 'LANDSAT_MSS1', 0);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active)
VALUES ('Landsat 4-8 Combined', 'LANDSAT_COMBINED', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active)
VALUES ('Landsat 7/8 Combined', 'LANDSAT_COMBINED78', 1);
INSERT INTO data_set (dataset_name, dataset_value, dataset_active)
VALUES ('Planet Labs Scenes', 'PLANET_LAB_SCENES', 1);

INSERT INTO groups_system (id, group_name) VALUES (46, 'admin');

INSERT INTO roles (role_name, role_desc) VALUES ('application_admin', 'Application Administrator');


INSERT INTO users (username, full_name, user_uid) VALUES ('sepalAdminWeb', 'sepalAdminWeb', 1001);
INSERT INTO users_roles (user_id, role_id, created_by) VALUES (1, 1, 1);

INSERT INTO metadata_providers
VALUES (1, 'EarthExplorer', 1, 'http://earthexplorer.usgs.gov/EE/InventoryStream/pathrow', 150, 10, NULL, NULL);
INSERT INTO metadata_providers VALUES (2, 'PlanetLabs', 0, '', 0, 0, NULL, NULL);

INSERT INTO metadata_crawling_criteria (metadata_provider_id, field_name, expected_value)
VALUES (1, 'DATA_TYPE_L1', 'L1T');

