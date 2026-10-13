-- One row per user whose Data user-data has seen. dirty_since marks a user whose Data may have changed since the
-- last measurement; it is cleared only when a measurement is recorded, so a crash in between keeps the mark.
CREATE TABLE IF NOT EXISTS `data_usage` (
    `username`     varchar(32)  COLLATE ascii_general_ci NOT NULL,
    `size`         bigint       DEFAULT NULL,
    `measured_at`  timestamp    NULL DEFAULT NULL,
    `dirty_since`  timestamp    NULL DEFAULT NULL,
    PRIMARY KEY (`username`)
) ENGINE=InnoDB;
