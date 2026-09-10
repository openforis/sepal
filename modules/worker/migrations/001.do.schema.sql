-- Worker schema: the worker-cluster tables. Targets are unqualified so any database can be built from
-- this file. The one-off copy from the legacy `sdms` schema lives in
-- migrations/legacy-import.
--
-- NOTE: rmb_message / rmb_message_processing belonged to the Groovy sepal-server (reliable message bus)
-- and stay in sdms. Vestigial access-control tables (users/groups/etc.) remain there too.

CREATE TABLE IF NOT EXISTS `worker_session` (
    `id`                     varchar(36)   NOT NULL,
    `state`                  varchar(16)   NOT NULL,
    `username`               varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `worker_type`            varchar(32)   NOT NULL,
    `instance_type`          varchar(64)   NOT NULL,
    `instance_id`            varchar(255)  NOT NULL,
    -- Debugging aid only; consumers derive the name from the instance id.
    `instance_name`          varchar(64)   DEFAULT NULL,
    `host`                   varchar(255)  NOT NULL,
    `creation_time`          timestamp     NOT NULL,
    `update_time`            timestamp     NOT NULL,
    `timeout_time`           timestamp     NULL DEFAULT NULL,
    `last_interaction_time`  timestamp     NULL DEFAULT NULL,
    `active_time`            timestamp     NULL DEFAULT NULL,
    `notification_state`     enum('NONE','NOTIFIED','DISMISSED','EMAILED') NOT NULL DEFAULT 'NONE',
    `notified_time`          timestamp     NULL DEFAULT NULL,
    `api_key`                varchar(64)   DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_worker_session_api_key` (`api_key`),
    KEY `idx_worker_session_1` (`username`, `worker_type`, `state`, `instance_type`) USING BTREE,
    KEY `idx_worker_session_2` (`state`, `username`, `update_time`) USING BTREE,
    KEY `idx_worker_session_3` (`instance_id`, `state`) USING BTREE,
    KEY `idx_worker_session_4` (`username`, `creation_time`, `update_time`) USING BTREE,
    KEY `idx_worker_session_5` (`state`, `timeout_time`) USING BTREE
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- task
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `task` (
    `id`                 varchar(36)   NOT NULL,
    `state`              varchar(16)   NOT NULL,
    `username`           varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `session_id`         varchar(36)   NOT NULL,
    `operation`          varchar(255)  NOT NULL,
    `params`             longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
    `status_description` longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
    `creation_time`      timestamp     NOT NULL,
    `update_time`        timestamp     NOT NULL,
    `removed`            tinyint(1)    NOT NULL,
    `recipe_id`          varchar(36)   DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_task_1` (`state`, `update_time`) USING BTREE,
    KEY `idx_task_2` (`session_id`, `state`) USING BTREE,
    KEY `idx_task_3` (`username`, `removed`, `creation_time`) USING BTREE,
    KEY `idx_task_4` (`username`, `state`) USING BTREE
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- instance_claim: allocation arbitration; the hosting service owns instance inventory.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `instance_claim` (
    `instance_id` varchar(255) NOT NULL,
    `session_id`  varchar(36) NOT NULL,
    `claimed_at`  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`instance_id`),
    KEY `idx_instance_claim_1` (`claimed_at`)
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- session_app — pins a user's app (by catalog path) to the worker session it was started on.
-- One row per (username, app_path): an app is permanently associated with one session until
-- that session closes (rows are deleted when worker_session.state transitions to CLOSED).
-- client_id — the gateway ws client (browser window) whose tab owns the association. Nullable:
-- starts made before the ws delivered a clientId have no owner; ownerless rows are never swept
-- on clientDown and never produce takeover notifications.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_app` (
    `username`      varchar(32)  COLLATE ascii_general_ci NOT NULL,
    `app_path`      varchar(255) NOT NULL,
    `session_id`    varchar(36)  NOT NULL,
    `label`         varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
    `client_id`     varchar(64)  DEFAULT NULL,
    `creation_time` timestamp    NOT NULL,
    PRIMARY KEY (`username`, `app_path`),
    KEY `idx_session_app_1` (`session_id`)
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- instance_usage_sample — one row per (session, sampling tick), written by the
-- instanceUsage sampler (docs/instance-resource-monitoring.md, phase 1).
-- cpu_pct/gpu_pct are 0-100 of the WHOLE instance; NULL means "not measured this tick"
-- (first tick after a sampler restart has no counter baseline; GPU only on GPU types).
-- Retention: pruned after USAGE_SAMPLE_RETENTION_DAYS (default 30) by the daily prune job.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `instance_usage_sample` (
    `session_id`         varchar(36)  NOT NULL,
    `username`           varchar(32)  COLLATE ascii_general_ci NOT NULL,
    `instance_type`      varchar(64)  NOT NULL,
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
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- instance_usage_hourly — per-session hourly aggregates, upserted by the hourly rollup
-- job; feeds the phase-4 admin usage reports. Retention: USAGE_HOURLY_RETENTION_DAYS
-- (default 365).
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `instance_usage_hourly` (
    `session_id`          varchar(36)  NOT NULL,
    `username`            varchar(32)  COLLATE ascii_general_ci NOT NULL,
    `instance_type`       varchar(64)  NOT NULL,
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
) ENGINE=InnoDB;
