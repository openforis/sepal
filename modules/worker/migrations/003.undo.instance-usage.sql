ALTER TABLE worker.`worker_session`
    DROP COLUMN `idle_state`,
    DROP COLUMN `warned_time`,
    DROP COLUMN `last_user_activity_time`;

DROP TABLE IF EXISTS worker.`instance_usage_hourly`;
DROP TABLE IF EXISTS worker.`instance_usage_sample`;
