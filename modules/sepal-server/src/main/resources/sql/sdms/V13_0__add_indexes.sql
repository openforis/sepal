ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_1` (`state`, `update_time`) USING BTREE;

ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_2` (`session_id`, `state`) USING BTREE;

ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_3` (`username`, `removed`, `creation_time`) USING BTREE;

ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_4` (`username`, `state`) USING BTREE;

ALTER TABLE `sdms`.`worker_session`
DROP INDEX `idx_worker_session_1`,
ADD INDEX `idx_worker_session_1` (`username`, `worker_type`, `state`, `instance_type`) USING BTREE;

ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_2` (`state`) USING BTREE;

ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_3` (`earliest_timeout_time`, `state`, `update_time`) USING BTREE;

ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_4` (`instance_id`, `state`) USING BTREE;

ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_5` (`username`, `creation_time`, `update_time`) USING BTREE;

ALTER TABLE `sdms`.`user_monthly_storage`
DROP INDEX `idx_user_monthly_storage_1`;

ALTER TABLE `sdms`.`user_budget`
ADD INDEX `idx_user_budget_1` (`username`) USING BTREE;

ALTER TABLE `sdms`.`budget_update_request`
ADD INDEX `idx_budget_update_request_2` (`state`) USING BTREE;
