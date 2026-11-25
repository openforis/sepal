-- User schema. The table is created at its full current shape, so there is no separate credential or
-- POSIX column migration and no fresh-install base DDL: this file is the whole schema. Targets are
-- unqualified so any database can be built from it; the one-off copy from the legacy `sepal_user` schema
-- lives in migrations/legacy-import.
--
-- Usernames and emails identify people, so their comparisons and UNIQUE indexes ignore case.

CREATE TABLE IF NOT EXISTS `sepal_user` (
  `id`                             int(11)       NOT NULL AUTO_INCREMENT,
  `username`                       varchar(32)   COLLATE ascii_general_ci NOT NULL,
  `name`                           varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `email`                          varchar(255)  COLLATE ascii_general_ci DEFAULT NULL,
  `organization`                   varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `token`                          varchar(256)  DEFAULT NULL,
  `admin`                          tinyint(1)    NOT NULL,
  `system_user`                    tinyint(1)    NOT NULL,
  `status`                         varchar(32)   NOT NULL,
  `google_refresh_token`           varchar(128)  DEFAULT NULL,
  `google_access_token`            varchar(256)  DEFAULT NULL,
  `google_access_token_expiration` timestamp     NULL DEFAULT NULL,
  `creation_time`                  timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`                    timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `token_generation_time`          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_time`                timestamp     NULL DEFAULT NULL,
  `email_notifications_enabled`    tinyint(1)    DEFAULT '1',
  `intended_use`                   longtext      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci,
  `google_project_id`              varchar(1024) DEFAULT NULL,
  `google_legacy_project`          tinyint(4)    DEFAULT '0',
  `manual_map_rendering_enabled`   tinyint(1)    DEFAULT '0',
  `privacy_policy_accepted`        tinyint(1)    DEFAULT '0',
  `password_hash`                  varchar(255)  DEFAULT NULL,
  `ssh_public_key`                 text,
  `uid`                            int(11)       DEFAULT NULL,
  `gid`                            int(11)       DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_sepal_user_2` (`username`) USING BTREE,
  UNIQUE KEY `idx_sepal_user_4` (`token`) USING BTREE,
  UNIQUE KEY `idx_sepal_user_3` (`email`) USING BTREE,
  KEY `idx_sepal_user_1` (`creation_time`) USING BTREE
) ENGINE=InnoDB;
