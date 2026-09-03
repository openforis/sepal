-- Scene metadata schema.
--
-- Nothing is copied from the legacy `sdms.scene_meta_data`: the table holds purely derived data,
-- rebuilt in full from the USGS/Copernicus CSV exports on the ingester's first run and kept current
-- from STAC thereafter. The ingester loads into a staging schema and swaps the table in
-- (`scene_metadata_new` → `scene_metadata`), so this definition matches what the swap installs:
-- MyISAM, which is what LOAD DATA is fastest into. `browse_url` is gone (dropped in the legacy
-- schema by V14_0 and never written by this module).

CREATE SCHEMA IF NOT EXISTS scene_metadata;

CREATE TABLE IF NOT EXISTS scene_metadata.`scene_meta_data` (
    `id`               varchar(255) NOT NULL,
    `meta_data_source` varchar(255) NOT NULL,
    `sensor_id`        varchar(255) NOT NULL,
    `scene_area_id`    varchar(255) NOT NULL,
    `acquisition_date` datetime     NOT NULL,
    `day_of_year`      smallint(6)  NOT NULL,
    `cloud_cover`      double       NOT NULL,
    `sun_azimuth`      double       NOT NULL,
    `sun_elevation`    double       NOT NULL,
    `update_time`      timestamp    NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_scene_meta_data_1` (`scene_area_id`, `acquisition_date`, `day_of_year`) USING BTREE
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
