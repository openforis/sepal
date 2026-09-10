-- Budget schema: the five budget tables, copied verbatim from the worker schema when this module was
-- extracted, plus the event-sourced open_session_use table that replaced the worker `instance_use` view.
-- Targets are unqualified so any database can be built from this file. The one-off copy from `sdms`
-- lives in migrations/legacy-import.

CREATE TABLE IF NOT EXISTS `user_budget` (
    `username`         varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `monthly_instance` int(11)       NOT NULL,
    `monthly_storage`  int(11)       NOT NULL,
    `storage_quota`    int(11)       NOT NULL,
    PRIMARY KEY (`username`)
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- default_user_budget: a single row, and deliberately without a primary key
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `default_user_budget` (
    `monthly_instance` int(11)  NOT NULL,
    `monthly_storage`  int(11)  NOT NULL,
    `storage_quota`    int(11)  NOT NULL
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- user_monthly_storage
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_monthly_storage` (
    `username`     varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `year`         int(11)       NOT NULL,
    `month`        int(11)       NOT NULL,
    `gb_hours`     double        NOT NULL,
    `storage_used` double        NOT NULL,
    `update_time`  timestamp     NOT NULL,
    PRIMARY KEY (`username`, `year`, `month`)
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- user_spending
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_spending` (
    `username`          varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `instance_spending` double        NOT NULL DEFAULT '0',
    `storage_spending`  double        NOT NULL DEFAULT '0',
    `storage_usage`     double        NOT NULL DEFAULT '0',
    PRIMARY KEY (`username`)
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- budget_update_request
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `budget_update_request` (
    `id`                         varchar(36)   NOT NULL,
    `username`                   varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `state`                      varchar(16)   NOT NULL,
    `message`                    text          CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
    `initial_monthly_instance`   int(11)       NOT NULL,
    `initial_monthly_storage`    int(11)       NOT NULL,
    `initial_storage_quota`      int(11)       NOT NULL,
    `requested_monthly_instance` int(11)       NOT NULL,
    `requested_monthly_storage`  int(11)       NOT NULL,
    `requested_storage_quota`    int(11)       NOT NULL,
    `final_monthly_instance`     int(11)       DEFAULT NULL,
    `final_monthly_storage`      int(11)       DEFAULT NULL,
    `final_storage_quota`        int(11)       DEFAULT NULL,
    `creation_time`              timestamp     NOT NULL,
    `update_time`                timestamp     NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_budget_update_request_1` (`username`, `state`),
    KEY `idx_budget_update_request_2` (`state`) USING BTREE
) ENGINE=InnoDB;

-- -------------------------------------------------------------------------
-- open_session_use: event-sourced instance use, replacing the worker `instance_use` view. Events
-- (WorkerSessionActivated/Closed) keep it current; the hourly reconciler heals drift.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `open_session_use` (
    `session_id`    varchar(36)  NOT NULL,
    `username`      varchar(32)  COLLATE ascii_general_ci NOT NULL,
    `instance_type` varchar(64)  NOT NULL,
    `from_time`     timestamp    NOT NULL,
    `to_time`       timestamp    NULL DEFAULT NULL,   -- NULL while the session is open
    PRIMARY KEY (`session_id`),
    KEY `idx_open_session_use_1` (`username`, `from_time`),
    KEY `idx_open_session_use_2` (`to_time`)
) ENGINE=InnoDB;
