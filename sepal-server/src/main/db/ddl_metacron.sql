DROP TABLE IF EXISTS `sdms`.`metadata_providers`;
CREATE TABLE  `sdms`.`metadata_providers` (
  `id` int(10) unsigned NOT NULL,
  `name` varchar(45) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `crawling_entrypoint` varchar(255) NOT NULL,
  `iterations` int(10) default 4,
  `iteration_size` int(10) default 186,
  `last_execution_start` DATETIME default null,
  `last_execution_end` DATETIME default null,
  PRIMARY KEY (`id`)
);

ALTER TABLE `sdms`.`data_set` ADD COLUMN `metadata_provider` INTEGER UNSIGNED NOT NULL DEFAULT 1;

INSERT INTO metadata_providers VALUES(1,'EarthExplorer',1,'http://earthexplorer.usgs.gov/EE/InventoryStream/pathrow',4,186,null,null);
INSERT INTO metadata_providers VALUES(2,'PlanetLabs',0,'',0,0,null,null);
UPDATE data_set SET dataset_provider = 2 where lower(dataset_value) LIKE 'planet%';


DROP TABLE IF EXISTS `sdms`.`data_set_providers`;

