-- Budget schema migration (Phase 6 extraction)
-- Fresh schema for the standalone `budget` module: the 5 budget tables (copied verbatim
-- from modules/worker/migrations/001.do.schema.sql, retargeted to schema `budget`) plus a
-- new event-sourced open_session_use table (replaces the worker `instance_use` view).
--
-- Data is copied here AUTOMATICALLY (no manual/deploy-time step), using the same idempotent,
-- COPY-ONLY guard as the worker migration: for each table, copy from the untouched ORIGINAL
-- `sdms` schema ONLY IF the sdms source exists AND the budget target is still empty. This never
-- modifies `sdms` (read-only), so rollback to the pre-migration state stays clean: dropping the
-- `budget` schema fully reverts this module. Runs inside the Postgrator migration (before the
-- module's schedulers/subscribers start), so spending is complete before the first rebuild.
-- Usernames are lowercased on the way in: the legacy tables stored them as typed, while
-- `sepal_user` is uniformly lowercase and every read path lowercases anyway.
-- The shared migration runner executes the whole file as one multi-statement query, so the
-- session @vars + PREPARE/EXECUTE persist across statements.

CREATE SCHEMA IF NOT EXISTS budget;

-- -------------------------------------------------------------------------
-- user_budget (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`user_budget` (
    `username`         varchar(32)   NOT NULL,
    `monthly_instance` int(11)       NOT NULL,
    `monthly_storage`  int(11)       NOT NULL,
    `storage_quota`    int(11)       NOT NULL,
    PRIMARY KEY (`username`)
) ENGINE=InnoDB;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_budget')
    AND (SELECT COUNT(*) FROM budget.`user_budget`)=0,
    'INSERT INTO budget.`user_budget` (username, monthly_instance, monthly_storage, storage_quota) SELECT LOWER(username), monthly_instance, monthly_storage, storage_quota FROM sdms.`user_budget`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- default_user_budget (single-row, NO primary key: the copy-if-empty guard is
-- what keeps this idempotent — a bare INSERT would duplicate the singleton row)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`default_user_budget` (
    `monthly_instance` int(11)  NOT NULL,
    `monthly_storage`  int(11)  NOT NULL,
    `storage_quota`    int(11)  NOT NULL
) ENGINE=InnoDB;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='default_user_budget')
    AND (SELECT COUNT(*) FROM budget.`default_user_budget`)=0,
    'INSERT INTO budget.`default_user_budget` SELECT * FROM sdms.`default_user_budget`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- user_monthly_storage (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`user_monthly_storage` (
    `username`     varchar(32)   NOT NULL,
    `year`         int(11)       NOT NULL,
    `month`        int(11)       NOT NULL,
    `gb_hours`     double        NOT NULL,
    `storage_used` double        NOT NULL,
    `update_time`  timestamp     NOT NULL,
    PRIMARY KEY (`username`, `year`, `month`)
) ENGINE=InnoDB;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_monthly_storage')
    AND (SELECT COUNT(*) FROM budget.`user_monthly_storage`)=0,
    'INSERT INTO budget.`user_monthly_storage` (username, year, month, gb_hours, storage_used, update_time) SELECT LOWER(username), year, month, gb_hours, storage_used, update_time FROM sdms.`user_monthly_storage`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- user_spending (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`user_spending` (
    `username`          varchar(32)   NOT NULL,
    `instance_spending` double        NOT NULL DEFAULT '0',
    `storage_spending`  double        NOT NULL DEFAULT '0',
    `storage_usage`     double        NOT NULL DEFAULT '0',
    PRIMARY KEY (`username`)
) ENGINE=InnoDB;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='user_spending')
    AND (SELECT COUNT(*) FROM budget.`user_spending`)=0,
    'INSERT INTO budget.`user_spending` (username, instance_spending, storage_spending, storage_usage) SELECT LOWER(username), instance_spending, storage_spending, storage_usage FROM sdms.`user_spending`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- budget_update_request (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`budget_update_request` (
    `id`                         varchar(36)   NOT NULL,
    `username`                   varchar(32)   NOT NULL,
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

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='budget_update_request')
    AND (SELECT COUNT(*) FROM budget.`budget_update_request`)=0,
    'INSERT INTO budget.`budget_update_request` (id, username, state, message, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time) SELECT id, LOWER(username), state, message, initial_monthly_instance, initial_monthly_storage, initial_storage_quota, requested_monthly_instance, requested_monthly_storage, requested_storage_quota, final_monthly_instance, final_monthly_storage, final_storage_quota, creation_time, update_time FROM sdms.`budget_update_request`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- open_session_use (new: event-sourced instance-use, replaces worker.instance_use VIEW).
-- Seeded from the ORIGINAL sdms.worker_session: every OPEN session (PENDING/ACTIVE) plus every
-- session CLOSED in the current month (both contribute to this month's instance spend). Events
-- (WorkerSessionActivated/Closed) keep it current thereafter; the hourly reconciler heals drift.
-- Copy-only + copy-if-empty guard → idempotent, never touches sdms.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget.`open_session_use` (
    `session_id`    varchar(36)  NOT NULL,
    `username`      varchar(32)  NOT NULL,
    `instance_type` varchar(64)  NOT NULL,
    `from_time`     timestamp    NOT NULL,
    `to_time`       timestamp    NULL DEFAULT NULL,   -- NULL while the session is open
    PRIMARY KEY (`session_id`),
    KEY `idx_open_session_use_1` (`username`, `from_time`),
    KEY `idx_open_session_use_2` (`to_time`)
) ENGINE=InnoDB;

SET @do_seed := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='worker_session')
    AND (SELECT COUNT(*) FROM budget.`open_session_use`)=0,
    'INSERT INTO budget.`open_session_use` (session_id, username, instance_type, from_time, to_time) SELECT id, LOWER(username), instance_type, creation_time, CASE WHEN state=''CLOSED'' THEN update_time ELSE NULL END FROM sdms.`worker_session` WHERE state IN (''PENDING'',''ACTIVE'') OR (state=''CLOSED'' AND update_time >= DATE_FORMAT(NOW(),''%Y-%m-01''))',
    'DO 0'));
PREPARE _s FROM @do_seed; EXECUTE _s; DEALLOCATE PREPARE _s;
