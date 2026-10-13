DROP TABLE IF EXISTS `user_monthly_data_storage`;
ALTER TABLE `user_spending` DROP COLUMN `data_usage`;
ALTER TABLE `budget_update_request`
    DROP COLUMN `final_data_quota`,
    DROP COLUMN `requested_data_quota`,
    DROP COLUMN `initial_data_quota`;
ALTER TABLE `user_budget` DROP COLUMN `data_quota`;
DROP TABLE IF EXISTS `default_data_quota`;
