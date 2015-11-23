CREATE DATABASE sepal_sandbox;

GRANT ALL PRIVILEGES ON sepal_sandbox.* TO 'sepal'@'%';


CREATE TABLE `sepal_sandbox`.`sandboxes` (
  `sandbox_id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(255) NOT NULL,
  `status` VARCHAR(255) NOT NULL DEFAULT 'CREATED',
  `container_id` VARCHAR(255) NULL,
  `uri` VARCHAR(255) NULL,
  `created_on` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `terminated_on` TIMESTAMP,
  `status_refreshed_on` TIMESTAMP,
  PRIMARY KEY (`sandbox_id`));

ALTER TABLE `sdms`.`users`
DROP COLUMN `sandbox_uri`,
DROP COLUMN `sandbox_id`;
