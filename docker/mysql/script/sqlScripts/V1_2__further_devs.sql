CREATE TABLE  metadata_crawling_criteria (
  criteria_id int(10) unsigned NOT NULL AUTO_INCREMENT,
  metadata_provider_id int(10) unsigned NOT NULL,
  field_name varchar(255) NOT NULL,
  expected_value varchar(255) NOT NULL,
  PRIMARY KEY (`criteria_id`)
);

CREATE TABLE  metadata_providers (
  id INT(11) unsigned NOT NULL,
  name VARCHAR(45) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT '1',
  crawling_entrypoint VARCHAR(255) NOT NULL,
  iterations int(10) default 4,
  iteration_size int(10) default 18,
  last_execution_start DATETIME default null,
  last_execution_end DATETIME default null,
  PRIMARY KEY (`id`)
);

ALTER TABLE users ADD  user_uid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_set ADD metadata_provider INTEGER NOT NULL DEFAULT 1;


INSERT INTO users(username,full_name,user_uid) VALUES('sepalAdminWeb','sepalAdminWeb',1001);
INSERT INTO users_roles(user_id,role_id,created_by) values(1,1,1);
INSERT INTO metadata_providers VALUES(1,'EarthExplorer',1,'http://earthexplorer.usgs.gov/EE/InventoryStream/pathrow',150,10,null,null);
INSERT INTO metadata_providers VALUES(2,'PlanetLabs',0,'',0,0,null,null);
INSERT INTO metadata_crawling_criteria(metadata_provider_id,field_name,expected_value) VALUES (1, 'DATA_TYPE_L1','L1T');

UPDATE data_set SET metadata_provider = 2 WHERE id  = 9;

ALTER TABLE image_log MODIFY COLUMN downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE image_log MODIFY COLUMN last_accessed DATETIME NULL;
ALTER TABLE image_log MODIFY COLUMN accessed_by VARCHAR(50) NULL;
ALTER TABLE image_log MODIFY COLUMN deleted INT(11) NOT NULL DEFAULT 0;

DELETE FROM usgs_data_repo WHERE DATA_TYPE_L1 <> 'L1T';


