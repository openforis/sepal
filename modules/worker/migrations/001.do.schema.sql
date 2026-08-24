-- Consolidated worker schema migration (Phase 4a-revision, COPY strategy)
-- COPIES worker-cluster tables from sdms + worker_instance into a single worker schema.
-- Originals in sdms / worker_instance are LEFT INTACT as a rollback safety net.
-- Java continues to use sdms / worker_instance directly (they remain live + authoritative).
-- Idempotent: CREATE TABLE IF NOT EXISTS target first, then copy only if source exists
-- AND target is still empty (guards against duplicate rows on re-run).
-- NOTE: rmb_message / rmb_message_processing are owned by the Groovy sepal-server (reliable
-- message bus) and stay in sdms — they are NOT part of the worker schema.
-- Vestigial access-control tables (users/groups/etc.) remain in sdms — NOT copied.

CREATE SCHEMA IF NOT EXISTS worker;

-- -------------------------------------------------------------------------
-- worker_session (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker.`worker_session` (
    `id`                     varchar(255)  NOT NULL,
    `state`                  varchar(255)  NOT NULL,
    `username`               varchar(255)  NOT NULL,
    `worker_type`            varchar(255)  NOT NULL,
    `instance_type`          varchar(255)  NOT NULL,
    `instance_id`            varchar(255)  NOT NULL,
    `host`                   varchar(255)  NOT NULL,
    `creation_time`          timestamp     NOT NULL,
    `update_time`            timestamp     NOT NULL,
    `earliest_timeout_time`  timestamp     NULL DEFAULT NULL,
    `api_key`                varchar(64)   DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_worker_session_api_key` (`api_key`),
    KEY `idx_worker_session_1` (`username`, `worker_type`, `state`, `instance_type`) USING BTREE,
    KEY `idx_worker_session_2` (`state`) USING BTREE,
    KEY `idx_worker_session_3` (`earliest_timeout_time`, `state`, `update_time`) USING BTREE,
    KEY `idx_worker_session_4` (`instance_id`, `state`) USING BTREE,
    KEY `idx_worker_session_5` (`username`, `creation_time`, `update_time`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='worker_session')
    AND (SELECT COUNT(*) FROM worker.`worker_session`)=0,
    'INSERT INTO worker.`worker_session` SELECT * FROM sdms.`worker_session`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- task (copy from sdms if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker.`task` (
    `id`                 varchar(255)  NOT NULL,
    `state`              varchar(255)  NOT NULL,
    `username`           varchar(255)  NOT NULL,
    `session_id`         varchar(255)  NOT NULL,
    `operation`          varchar(255)  NOT NULL,
    `params`             longtext      NOT NULL,
    `status_description` longtext      NOT NULL,
    `creation_time`      timestamp     NOT NULL,
    `update_time`        timestamp     NOT NULL,
    `removed`            tinyint(1)    NOT NULL,
    `recipe_id`          varchar(255)  DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_task_1` (`state`, `update_time`) USING BTREE,
    KEY `idx_task_2` (`session_id`, `state`) USING BTREE,
    KEY `idx_task_3` (`username`, `removed`, `creation_time`) USING BTREE,
    KEY `idx_task_4` (`username`, `state`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sdms' AND TABLE_NAME='task')
    AND (SELECT COUNT(*) FROM worker.`task`)=0,
    'INSERT INTO worker.`task` SELECT * FROM sdms.`task`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;

-- -------------------------------------------------------------------------
-- instance (copy from worker_instance if present and target empty, else create fresh)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker.`instance` (
  `id`          varchar(255) NOT NULL,
  `type`        varchar(63)  NOT NULL,
  `worker_type` varchar(63)  DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_instance_1` (`type`, `worker_type`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='worker_instance' AND TABLE_NAME='instance')
    AND (SELECT COUNT(*) FROM worker.`instance`)=0,
    'INSERT INTO worker.`instance` SELECT * FROM worker_instance.`instance`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
