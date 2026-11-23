-- Scene catalogue schema.
--
-- The table holds purely derived data: rebuilt in full from the USGS/Copernicus CSV exports on the
-- ingester's first run, and kept current from STAC thereafter. The rebuild builds an index-free copy
-- (LIKE this table), indexes it and swaps it in, so the index is left for Postgres to name here and the
-- rebuild gives its copy's indexes the names it chose.

CREATE TABLE IF NOT EXISTS scene (
    id               varchar(255)     NOT NULL,
    meta_data_source varchar(255)     NOT NULL,
    sensor_id        varchar(255)     NOT NULL,
    scene_area_id    varchar(255)     NOT NULL,
    acquisition_date timestamptz(0)   NOT NULL,
    day_of_year      smallint         NOT NULL,
    cloud_cover      double precision NOT NULL,
    sun_azimuth      double precision NOT NULL,
    sun_elevation    double precision NOT NULL,
    update_time      timestamptz(0)   NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX ON scene (scene_area_id, acquisition_date, day_of_year);
