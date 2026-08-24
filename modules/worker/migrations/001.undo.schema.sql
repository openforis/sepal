-- Undo migration for worker schema (Phase 4a-revision)
-- Drops all tables created in 001.do.schema.sql.
-- NOTE: Does NOT move data back to sdms/worker_instance; provided for completeness only.

DROP TABLE IF EXISTS worker.`task`;
DROP TABLE IF EXISTS worker.`worker_session`;
DROP TABLE IF EXISTS worker.`instance`;
