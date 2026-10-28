-- Keys users register for SSH logins, alongside the SEPAL-generated key in sepal_user.ssh_public_key.
-- public_key is the base64 blob alone: nothing the user typed around it is kept.

CREATE TABLE IF NOT EXISTS `ssh_key` (
  `id`            int(11)       NOT NULL AUTO_INCREMENT,
  `username`      varchar(32)   COLLATE ascii_general_ci NOT NULL,
  `name`          varchar(255)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `key_type`      varchar(64)   COLLATE ascii_bin NOT NULL,
  `public_key`    text          COLLATE ascii_bin NOT NULL,
  `fingerprint`   varchar(64)   COLLATE ascii_bin NOT NULL,
  `creation_time` timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ssh_key_1` (`username`, `fingerprint`)
) ENGINE=InnoDB;
