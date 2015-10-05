USE `sdms`;
DROP TABLE IF EXISTS `metadata_crawling_criteria`;
CREATE TABLE  `metadata_crawling_criteria` (
  `criteria_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `metadata_provider_id` int(10) unsigned NOT NULL,
  `field_name` varchar(255) NOT NULL,
  `expected_value` varchar(255) NOT NULL,
  PRIMARY KEY (`criteria_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

DELETE FROM usgs_data_repo where DATA_TYPE_L1 <> 'L1T'