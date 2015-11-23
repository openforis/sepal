USE sdms;

CREATE TABLE admin_groups (
  id         INT(10)      NOT NULL,
  user_id    INT(10)      NOT NULL,
  group_id   VARCHAR(100) NOT NULL,
  created_by INT(10)      NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX idx_admin_groups_1 ON admin_groups (user_id);

CREATE TABLE config_details (
  name  VARCHAR(50) NOT NULL,
  value VARCHAR(50) NOT NULL
);

CREATE TABLE data_set (
  id             INT(11)     NOT NULL AUTO_INCREMENT,
  dataset_name   VARCHAR(50) NOT NULL,
  dataset_value  VARCHAR(50) NOT NULL,
  dataset_active TINYINT(1)  NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE groups (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  group_desc TEXT        NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE groups_system (
  id         INT(11)     NOT NULL AUTO_INCREMENT,
  group_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE image_log (
  id            INT(11)      NOT NULL AUTO_INCREMENT,
  name          VARCHAR(256) NOT NULL,
  downloaded_at DATETIME     NOT NULL,
  last_accessed DATETIME,
  accessed_by   VARCHAR(50),
  deleted       INT(11) NOT NULL DEFAULT 0,
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
  updated_at TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE temp_download_log (
  id         BIGINT(20)   NOT NULL AUTO_INCREMENT,
  username   VARCHAR(200) NOT NULL,
  filepath   VARCHAR(200) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
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
  updated_at     TIMESTAMP,
  sandbox_id VARCHAR(100) NULL,
  sandbox_uri VARCHAR(512) NULL,
  PRIMARY KEY (id)
);

CREATE TABLE users_groups (
  id             INT(11)     NOT NULL AUTO_INCREMENT,
  user_id        INT(11)     NOT NULL,
  group_id       VARCHAR(50) NOT NULL,
  is_group_admin TINYINT(4)  NOT NULL,
  created_by     INT(11)     NOT NULL,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE users_roles (
  id         INT(11)   NOT NULL AUTO_INCREMENT,
  user_id    INT(11)   NOT NULL,
  role_id    INT(11)   NOT NULL,
  created_by INT(11)   NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
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

CREATE TABLE download_requests (
  request_id   INT(11)      NOT NULL AUTO_INCREMENT,
  request_time TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  username     VARCHAR(255) NOT NULL,
  PRIMARY KEY (request_id)
);


CREATE TABLE requested_scenes (
  id                   INT(11)      NOT NULL AUTO_INCREMENT,
  request_id           INT(11)      NOT NULL,
  scene_id             VARCHAR(255) NOT NULL,
  dataset_id           INT(11)      NOT NULL,
  last_updated         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status               VARCHAR(255) NOT NULL DEFAULT 'REQUESTED',
  processing_chain     VARCHAR(255) ,
  PRIMARY KEY (`id`)
);







INSERT INTO config_details values('cron_delay_days','50');
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 8 OLI/TIRS','LANDSAT_8',1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 7 SLC-off (2003 ->)', 'LANDSAT_ETM_SLC_OFF', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 7 SLC-on (1999-2003)', 'LANDSAT_ETM', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 4-5 TM', 'LANDSAT_TM', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 4-5 MSS', 'LANDSAT_MSS', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 1-3 MSS', 'LANDSAT_MSS1', 0);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 4-8 Combined', 'LANDSAT_COMBINED', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Landsat 7/8 Combined', 'LANDSAT_COMBINED78', 1);
insert into data_set(dataset_name,dataset_value,dataset_active) values('Planet Labs Scenes', 'PLANET_LAB_SCENES', 1);
insert into groups_system(id,group_name) values (46,'admin');
insert into roles(role_name,role_desc) values('application_admin','Application Administrator');



