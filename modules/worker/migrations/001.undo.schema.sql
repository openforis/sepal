-- Undo migration for the worker schema.
-- Drops all tables created in 001.do.schema.sql.
-- NOTE: Does NOT move data back to sdms/worker_instance; provided for completeness only.

DROP TABLE IF EXISTS `instance_usage_hourly`;
DROP TABLE IF EXISTS `instance_usage_sample`;
DROP TABLE IF EXISTS `session_app`;
DROP TABLE IF EXISTS `task`;
DROP TABLE IF EXISTS `worker_session`;
DROP TABLE IF EXISTS `instance`;
