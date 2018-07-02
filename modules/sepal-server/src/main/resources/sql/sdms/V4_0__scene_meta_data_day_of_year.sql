DROP TABLE scene_meta_data;

CREATE TABLE scene_meta_data (
  id               VARCHAR(255) NOT NULL,
  meta_data_source VARCHAR(255) NOT NULL,
  sensor_id        VARCHAR(255) NOT NULL,
  scene_area_id    VARCHAR(255) NOT NULL,
  acquisition_date DATETIME     NOT NULL,
  day_of_year      SMALLINT     NOT NULL,
  cloud_cover      DOUBLE       NOT NULL,
  sun_azimuth      DOUBLE       NOT NULL,
  sun_elevation    DOUBLE       NOT NULL,
  browse_url       VARCHAR(255) NOT NULL,
  update_time      TIMESTAMP    NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX idx_scene_meta_data_1
  ON scene_meta_data (scene_area_id, acquisition_date, day_of_year);