CREATE TABLE item (
  id       VARCHAR(36)  NOT NULL PRIMARY KEY,
  username VARCHAR(32)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  note     TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  flag     TINYINT(1)   NOT NULL,
  doc      LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  at       TIMESTAMP(3) NULL
);

CREATE TABLE tag (
  name VARCHAR(32) NOT NULL PRIMARY KEY,
  kind ENUM('PLAIN', 'SPECIAL') NOT NULL DEFAULT 'PLAIN'
);
