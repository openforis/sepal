DROP VIEW sepal_sandbox.instances_status;


RENAME TABLE sepal_sandbox.sandboxes TO sepal_sandbox.sandbox_sessions;
ALTER TABLE sepal_sandbox.sandbox_sessions  DROP COLUMN size;
ALTER TABLE sepal_sandbox.sandbox_sessions MODIFY sandbox_id INT NOT NULL;
ALTER TABLE sepal_sandbox.sandbox_sessions DROP PRIMARY KEY;

ALTER TABLE sepal_sandbox.sandbox_sessions CHANGE sandbox_id session_id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE sepal_sandbox.sandbox_sessions CHANGE uri container_uri VARCHAR(255) NULL;
ALTER TABLE sepal_sandbox.sandbox_sessions ADD PRIMARY KEY(session_id);


ALTER TABLE sdms.users ADD monthly_quota INT(11) NULL DEFAULT 100;


ALTER TABLE sepal_sandbox.instances  DROP COLUMN capacity;
ALTER TABLE sepal_sandbox.instances  DROP COLUMN reserved;
ALTER TABLE sepal_sandbox.instances  DROP COLUMN disposable;
ALTER TABLE sepal_sandbox.instances  ADD instance_type INT(11) NOT NULL DEFAULT 0;


CREATE TABLE sepal_sandbox.instance_types (
  id INT NOT NULL AUTO_INCREMENT,
  provider_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(250) NULL,
  hourly_costs DOUBLE NOT NULL,
  cpu_count DOUBLE NOT NULL,
  ram INT(11) NOT NULL,
  notes VARCHAR(500) NULL,
  enabled INT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
);




INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'t2.micro',0.027,0.25,1024);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'t2.small',0.056,0.5,2048);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'t2.medium',0.12,1,4096);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'t2.large',0.24,2,8192);

INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'m4.large',0.187,2,8192);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'m4.xlarge',0.374,4,16384);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'m4.2xlarge',0.748,8,32768);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'m4.4xlarge',1.496,16,65536);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'m4.10xlarge',3.74,40,163840);

INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'c4.large',0.144,2,3840);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'c4.xlarge',0.289,4,7680);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'c4.2xlarge',0.578,8,15360);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'c4.4xlarge',1.155,16,30720);
INSERT INTO sepal_sandbox.instance_types (provider_id, name, hourly_costs, cpu_count, ram) VALUES((SELECT id FROM instance_providers WHERE name = 'AWS'),'c4.8xlarge',2.31,36,61440);

INSERT INTO sepal_sandbox.instance_types (provider_id,name,hourly_costs, cpu_count,ram) VALUES((SELECT id FROM instance_providers WHERE name = 'Localhost'),'default',0,1,2048);

 # rename instances_dev to instances
CREATE OR REPLACE VIEW sepal_sandbox.v_session_status AS (
  SELECT ss.session_id AS id, ss.username AS username, ss.status AS status,
         ss.created_on AS created_on,ss.status_refreshed_on AS updated_on,ss.terminated_on AS terminated_on,
         TIME_TO_SEC(TIMEDIFF(COALESCE(ss.terminated_on,CURRENT_TIMESTAMP),ss.created_on)) AS uptime_secs,
         CEILING(TIME_TO_SEC( TIMEDIFF(COALESCE(ss.terminated_on,CURRENT_TIMESTAMP),ss.created_on) ) / 60 / 60) * instType.hourly_costs AS costs,
         ss.container_id AS cnt_id, ss.container_uri AS cnt_uri,
         inst.id AS cnt_inst_id, inst.status AS cnt_inst_status, inst.public_ip as cnt_inst_pub_ip,
         inst.private_ip as cnt_inst_priv_ip,inst.owner AS cnt_inst_owner,inst.name AS cnt_inst_name,
         inst.launch_time AS cnt_inst_start_time,inst.termination_time AS cnt_inst_end_time,inst.status_update_time AS cnt_inst_updated_on,
         TIME_TO_SEC(TIMEDIFF(COALESCE(inst.termination_time,CURRENT_TIMESTAMP),inst.launch_time)) AS cnt_inst_up_time_secs,
         CEILING(TIME_TO_SEC( TIMEDIFF(COALESCE(inst.termination_time,CURRENT_TIMESTAMP),inst.launch_time) ) / 60 / 60) * instType.hourly_costs AS cnt_inst_costs,
         dc.id as cnt_inst_dc_id, dc.name AS cnt_inst_dc_name, dc.geolocation AS cnt_inst_dc_location, dc.description AS cnt_inst_dc_description,
         pr.id AS cnt_inst_prov_id, pr.name AS cnt_inst_prov_name, pr.description AS cnt_inst_prov_descr,
         instType.id as cnt_inst_type_id, instType.name as cnt_inst_type_name,
         instType.description AS cnt_inst_type_descr, instType.hourly_costs AS cnt_inst_type_hourly_costs,
         instType.cpu_count AS cnt_inst_type_cpu_count, instType.ram AS cnt_inst_type_ram_count,
         instType.notes AS cnt_inst_type_notes, instType.enabled AS cnt_inst_type_enabled
  FROM sandbox_sessions ss
    INNER JOIN sepal_sandbox.instances inst ON ss.instance_id = inst.id
    INNER JOIN sepal_sandbox.datacenters dc ON inst.data_center_id = dc.id
    INNER JOIN sepal_sandbox.instance_types instType ON inst.instance_type_id = instType.id
    INNER JOIN sepal_sandbox.instance_providers pr ON instType.provider_id = pr.id
);

CREATE OR REPLACE VIEW sepal_sandbox.v_instances AS (
  SELECT ic.id AS icId, ic.status AS icStatus, ic.public_ip AS icPublicIp, ic.private_ip AS icPrivateIp, ic.owner AS icOwner, ic.name AS icName,
         ic.launch_time AS icLaunchTime, ic.termination_time AS icDateEnd, ic.status_update_time AS icUpdateTime,
         dc.id AS dcId, dc.name AS dcName, dc.geolocation AS dcGeoLocation, dc.description AS dcDescription,
         pr.id AS prId, pr.name AS prName, pr.description AS prDescription,
         type.id AS typeId, type.name AS typeName, type.description AS typeDescription,
         type.hourly_costs AS typeHourlyCost, type.cpu_count AS typeCpuCount, type.ram AS typeRam,
         type.notes AS typeNotes, type.enabled AS typeEnabled
         FROM instances ic INNER JOIN datacenters dc ON ic.data_center_id = dc.id
         INNER JOIN instance_types type ON ic.instance_type_id = type.id
        INNER JOIN instance_providers pr ON dc.provider_id = pr.id
);







