ALTER TABLE worker.`worker_session`
    ADD COLUMN `earliest_timeout_time`  timestamp NULL DEFAULT NULL,
    ADD COLUMN `idle_state`             enum('OK','WARNED') NOT NULL DEFAULT 'OK',
    ADD COLUMN `warned_time`            timestamp NULL DEFAULT NULL,
    ADD COLUMN `last_user_activity_time` timestamp NULL DEFAULT NULL,
    ADD KEY `idx_worker_session_3` (`earliest_timeout_time`, `state`, `update_time`) USING BTREE;

ALTER TABLE worker.`worker_session`
    DROP KEY `idx_worker_session_6`,
    DROP COLUMN `timeout_time`,
    DROP COLUMN `last_interaction_time`,
    DROP COLUMN `active_time`,
    DROP COLUMN `notification_state`,
    DROP COLUMN `notified_time`;
