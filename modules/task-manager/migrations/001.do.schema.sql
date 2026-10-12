CREATE TABLE IF NOT EXISTS `task` (
    `id`                 varchar(36)   NOT NULL,
    `state`              varchar(16)   NOT NULL,
    `username`           varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `operation`          varchar(255)  NOT NULL,
    `params`             longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
    `status_description` longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
    `recipe_id`          varchar(36)   DEFAULT NULL,
    `api_key_hash`       char(64)      DEFAULT NULL,
    `creation_time`      timestamp(3)  NOT NULL,
    `update_time`        timestamp(3)  NOT NULL,
    `progress_time`      timestamp(3)  NULL DEFAULT NULL,
    `removed`            tinyint(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_task_api_key` (`api_key_hash`),
    KEY `idx_task_state` (`state`, `creation_time`),
    KEY `idx_task_user` (`username`, `removed`, `creation_time`)
) ENGINE=InnoDB;
