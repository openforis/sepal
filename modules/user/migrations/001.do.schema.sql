-- User schema.
-- COPIES sepal_user from the legacy `sepal_user` schema, which is LEFT INTACT as a rollback safety
-- net: the copy is read-only and guarded (copy only if the source exists AND the target is still
-- empty), so it is idempotent and dropping the `user` schema fully reverts this module. The table
-- is created at its full current shape, so there is no separate credential/POSIX column migration
-- and no fresh-install base DDL: this file is the whole schema.
-- The legacy `rmb_message` / `rmb_message_processing` relics belonged to the Groovy sepal-server
-- and stay in `sepal_user` — they are NOT copied.
-- Usernames are lowercased on the way in: the legacy table is already uniformly lowercase, and
-- every read path lowercases anyway, so this keeps the invariant explicit.
-- `email` opts out of the schema's ascii_bin default with ascii_general_ci: it is human-entered and
-- looked up by exact value (password reset, the email module, the signup uniqueness check), so it
-- must keep comparing — and its UNIQUE index must keep rejecting — case-insensitively.
-- `id` is copied verbatim because uid/gid are derived from it for users created by this module.
-- The shared migration runner executes the whole file as one multi-statement query, so the
-- session @vars + PREPARE/EXECUTE persist across statements.

CREATE SCHEMA IF NOT EXISTS user;

CREATE TABLE IF NOT EXISTS user.`sepal_user` (
  `id`                             int(11)       NOT NULL AUTO_INCREMENT,
  `username`                       varchar(32)   NOT NULL,
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

SET @do_copy := (SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA='sepal_user' AND TABLE_NAME='sepal_user')
    AND (SELECT COUNT(*) FROM user.`sepal_user`)=0,
    'INSERT INTO user.`sepal_user` (id, username, name, email, organization, token, admin, system_user, status, google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time, token_generation_time, last_login_time, email_notifications_enabled, intended_use, google_project_id, google_legacy_project, manual_map_rendering_enabled, privacy_policy_accepted, password_hash, ssh_public_key, uid, gid) SELECT id, LOWER(username), name, email, organization, token, admin, system_user, status, google_refresh_token, google_access_token, google_access_token_expiration, creation_time, update_time, token_generation_time, last_login_time, email_notifications_enabled, intended_use, google_project_id, google_legacy_project, manual_map_rendering_enabled, privacy_policy_accepted, password_hash, ssh_public_key, uid, gid FROM sepal_user.`sepal_user`',
    'DO 0'));
PREPARE _s FROM @do_copy; EXECUTE _s; DEALLOCATE PREPARE _s;
