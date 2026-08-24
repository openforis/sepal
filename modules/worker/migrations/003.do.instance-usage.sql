-- instance_usage_sample — one row per (session, sampling tick), written by the
-- instanceUsage sampler (docs/instance-resource-monitoring.md, phase 1).
-- cpu_pct/gpu_pct are 0-100 of the WHOLE instance; NULL means "not measured this tick"
-- (first tick after a sampler restart has no counter baseline; GPU only on GPU types).
-- Retention: pruned after USAGE_SAMPLE_RETENTION_DAYS (default 30) by the daily prune job.
CREATE TABLE IF NOT EXISTS worker.`instance_usage_sample` (
    `session_id`         varchar(255) NOT NULL,
    `username`           varchar(255) NOT NULL,
    `instance_type`      varchar(255) NOT NULL,
    `sample_time`        timestamp    NOT NULL,
    `cpu_pct`            decimal(5,2) DEFAULT NULL,
    `ram_bytes`          bigint       DEFAULT NULL,
    `ram_pct`            decimal(5,2) DEFAULT NULL,
    `gpu_pct`            decimal(5,2) DEFAULT NULL,
    `gpu_ram_bytes`      bigint       DEFAULT NULL,
    `net_rx_bytes_per_s` bigint       DEFAULT NULL,
    `net_tx_bytes_per_s` bigint       DEFAULT NULL,
    PRIMARY KEY (`session_id`, `sample_time`),
    KEY `idx_instance_usage_sample_1` (`username`, `sample_time`) USING BTREE,
    KEY `idx_instance_usage_sample_2` (`sample_time`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- instance_usage_hourly — per-session hourly aggregates, upserted by the hourly rollup
-- job; feeds the phase-4 admin usage reports. Retention: USAGE_HOURLY_RETENTION_DAYS
-- (default 365).
CREATE TABLE IF NOT EXISTS worker.`instance_usage_hourly` (
    `session_id`          varchar(255) NOT NULL,
    `username`            varchar(255) NOT NULL,
    `instance_type`       varchar(255) NOT NULL,
    `hour`                timestamp    NOT NULL,
    `sample_count`        int          NOT NULL,
    `cpu_avg`             decimal(5,2) DEFAULT NULL,
    `cpu_max`             decimal(5,2) DEFAULT NULL,
    `ram_avg`             decimal(5,2) DEFAULT NULL,
    `ram_max`             decimal(5,2) DEFAULT NULL,
    `gpu_avg`             decimal(5,2) DEFAULT NULL,
    `gpu_max`             decimal(5,2) DEFAULT NULL,
    `gpu_ram_max`         bigint       DEFAULT NULL,
    `net_avg_bytes_per_s` bigint       DEFAULT NULL,
    PRIMARY KEY (`session_id`, `hour`),
    KEY `idx_instance_usage_hourly_1` (`username`, `hour`) USING BTREE,
    KEY `idx_instance_usage_hourly_2` (`hour`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- worker_session idle-policy columns — written by phase 2 (EvaluateIdleSessions);
-- created now so the schema matches the design doc's migration 003. Inert in phase 1.
ALTER TABLE worker.`worker_session`
    ADD COLUMN `idle_state`              enum('OK','WARNED') NOT NULL DEFAULT 'OK',
    ADD COLUMN `warned_time`             timestamp NULL DEFAULT NULL,
    ADD COLUMN `last_user_activity_time` timestamp NULL DEFAULT NULL;
