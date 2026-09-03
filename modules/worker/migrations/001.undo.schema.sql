-- Undo migration for the worker schema.
-- Drops all tables created in 001.do.schema.sql.
-- NOTE: Does NOT move data back to sdms/worker_instance; provided for completeness only.

DROP TABLE IF EXISTS worker.`instance_usage_hourly`;
DROP TABLE IF EXISTS worker.`instance_usage_sample`;
DROP TABLE IF EXISTS worker.`session_app`;
DROP TABLE IF EXISTS worker.`task`;
DROP TABLE IF EXISTS worker.`worker_session`;
DROP TABLE IF EXISTS worker.`instance`;
