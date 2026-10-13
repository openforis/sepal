-- Data: cloud storage measured by user-data, charged inside the storage budget and limited by its own quota.
-- default_user_budget is copied by the legacy import with SELECT *, so the default data quota lives in its own
-- table instead of a new column there. New columns on copied tables are nullable or defaulted.

CREATE TABLE IF NOT EXISTS `default_data_quota` (
    `data_quota` int(11) NOT NULL
) ENGINE=InnoDB;

INSERT INTO `default_data_quota` (`data_quota`)
SELECT 10 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `default_data_quota`);

ALTER TABLE `user_budget` ADD COLUMN `data_quota` int(11) DEFAULT NULL;

ALTER TABLE `budget_update_request`
    ADD COLUMN `initial_data_quota` int(11) DEFAULT NULL,
    ADD COLUMN `requested_data_quota` int(11) DEFAULT NULL,
    ADD COLUMN `final_data_quota` int(11) DEFAULT NULL;

ALTER TABLE `user_spending` ADD COLUMN `data_usage` double NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS `user_monthly_data_storage` (
    `username`     varchar(32)   COLLATE ascii_general_ci NOT NULL,
    `year`         int(11)       NOT NULL,
    `month`        int(11)       NOT NULL,
    `gb_hours`     double        NOT NULL,
    `storage_used` double        NOT NULL,
    `update_time`  timestamp     NOT NULL,
    PRIMARY KEY (`username`, `year`, `month`)
) ENGINE=InnoDB;
