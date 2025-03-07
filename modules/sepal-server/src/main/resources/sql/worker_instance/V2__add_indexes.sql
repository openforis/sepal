ALTER TABLE `worker_instance`.`instance`
ADD INDEX `idx_instance_1` (`type`, `worker_type`) USING BTREE;
