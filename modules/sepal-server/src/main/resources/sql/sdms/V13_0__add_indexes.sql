DROP PROCEDURE IF EXISTS sdms.DropIndexIfExists;

DELIMITER $$

CREATE PROCEDURE sdms.DropIndexIfExists(
    IN dbName VARCHAR(255), 
    IN tableName VARCHAR(255), 
    IN indexName VARCHAR(255)
)
BEGIN
    DECLARE indexExists INT DEFAULT 0;

    -- Check if the index exists
    SELECT COUNT(*)
    INTO indexExists
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = dbName 
      AND TABLE_NAME = tableName 
      AND INDEX_NAME = indexName;

    -- Drop the index if it exists
    IF indexExists > 0 THEN
        SET @sql_stmt = CONCAT('ALTER TABLE ', dbName, '.', tableName, ' DROP INDEX ', indexName);
        PREPARE stmt FROM @sql_stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- drop unneeded indexes

CALL sdms.DropIndexIfExists('sdms', 'user_monthly_storage', 'idx_user_monthly_storage_1');

-- task

CALL sdms.DropIndexIfExists('sdms', 'task', 'idx_task_1');
ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_1` (`state`, `update_time`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'task', 'idx_task_2');
ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_2` (`session_id`, `state`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'task', 'idx_task_3');
ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_3` (`username`, `removed`, `creation_time`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'task', 'idx_task_4');
ALTER TABLE `sdms`.`task`
ADD INDEX `idx_task_4` (`username`, `state`) USING BTREE;

-- worker_session

CALL sdms.DropIndexIfExists('sdms', 'worker_session', 'idx_worker_session_1');
ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_1` (`username`, `worker_type`, `state`, `instance_type`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'worker_session', 'idx_worker_session_2');
ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_2` (`state`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'worker_session', 'idx_worker_session_3');
ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_3` (`earliest_timeout_time`, `state`, `update_time`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'worker_session', 'idx_worker_session_4');
ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_4` (`instance_id`, `state`) USING BTREE;

CALL sdms.DropIndexIfExists('sdms', 'worker_session', 'idx_worker_session_5');
ALTER TABLE `sdms`.`worker_session`
ADD INDEX `idx_worker_session_5` (`username`, `creation_time`, `update_time`) USING BTREE;

-- user_budget

CALL sdms.DropIndexIfExists('sdms', 'user_budget', 'idx_user_budget_1');
ALTER TABLE `sdms`.`user_budget`
ADD INDEX `idx_user_budget_1` (`username`) USING BTREE;

-- budget_update_request

CALL sdms.DropIndexIfExists('sdms', 'budget_update_request', 'idx_budget_update_request_2');
ALTER TABLE `sdms`.`budget_update_request`
ADD INDEX `idx_budget_update_request_2` (`state`) USING BTREE;
