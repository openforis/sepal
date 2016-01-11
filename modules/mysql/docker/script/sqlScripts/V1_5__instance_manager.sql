USE sepal_sandbox;

ALTER TABLE sandboxes ADD instance_id INT(11)  NOT NULL;
ALTER TABLE sandboxes ADD size INT(2)  NOT NULL;

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
  status_update_time DATETIME NULL,
  disposable INT(1) NOT NULL DEFAULT 1,
  reserved INT(1) NOT NULL DEFAULT 1,
  data_center_id INT NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);

INSERT INTO instance_providers(name,description)  values('AWS','Amazon Web Services Cloud');
INSERT INTO instance_providers(name,description) values('Localhost','LocalInstanceProvider');


INSERT into datacenters(name,geolocation,description,provider_id) values('Localhost','Localhost','Local DataCenter',(SELECT id FROM instance_providers WHERE name = 'Localhost'));

INSERT INTO datacenters(name,geolocation,description,provider_id) values('us-east-1','us-east-1','US East (N. Virginia)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('us-west-2','us-west-2','US West (Oregon)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('us-west-1','us-west-1','US West (N. California)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('eu-west-1','eu-west-1','EU West (Ireland)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('eu-central-1','eu-central-1','EU Central (Frankfurt)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('ap-southeast-1','ap-southeast-1','Asia Pacific (Singapore)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('ap-northeast-1','ap-northeast-1','Asia Pacific (Tokyo)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('ap-southeast-2','ap-southeast-2','Asia Pacific (Sydney)',(SELECT id FROM instance_providers WHERE name = 'AWS'));
INSERT INTO datacenters(name,geolocation,description,provider_id) values('sa-east-1','sa-east-1','South America (Sao Paulo)',(SELECT id FROM instance_providers WHERE name = 'AWS'));














