-- Fresh-install base schema for sepal_user, applied by db.js BEFORE the Postgrator migrations
-- when the base table is missing. Captured from a live install (the final Java-Flyway V1..V15
-- state plus migration 001's credential/POSIX columns, so 001's AddColumnIfNotExists no-ops).
-- Guarded: a no-op on existing installs. Single statement only — db.js runs the whole file as
-- one query. The Java rmb_message/rmb_message_processing relics are deliberately not created.
CREATE TABLE IF NOT EXISTS `sepal_user`.`sepal_user` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(32) NOT NULL,
  `name` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(1000) DEFAULT NULL,
  `organization` varchar(1000) DEFAULT NULL,
  `token` varchar(256) DEFAULT NULL,
  `admin` tinyint(1) NOT NULL,
  `system_user` tinyint(1) NOT NULL,
  `status` varchar(32) NOT NULL,
  `google_refresh_token` varchar(128) DEFAULT NULL,
  `google_access_token` varchar(256) DEFAULT NULL,
  `google_access_token_expiration` timestamp NULL DEFAULT NULL,
  `creation_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `token_generation_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_time` timestamp NULL DEFAULT NULL,
  `email_notifications_enabled` tinyint(1) DEFAULT '1',
  `intended_use` longtext,
  `google_project_id` varchar(1024) DEFAULT NULL,
  `google_legacy_project` tinyint(4) DEFAULT '0',
  `manual_map_rendering_enabled` tinyint(1) DEFAULT '0',
  `privacy_policy_accepted` tinyint(1) DEFAULT '0',
  `password_hash` varchar(255) DEFAULT NULL,
  `ssh_public_key` text,
  `uid` int(11) DEFAULT NULL,
  `gid` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_sepal_user_2` (`username`) USING BTREE,
  UNIQUE KEY `idx_sepal_user_4` (`token`) USING BTREE,
  UNIQUE KEY `idx_sepal_user_3` (`email`) USING BTREE,
  KEY `idx_sepal_user_1` (`creation_time`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
