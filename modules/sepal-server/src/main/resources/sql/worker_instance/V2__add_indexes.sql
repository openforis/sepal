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

-- instance

CALL processing_recipe.DropIndexIfExists('worker_instance', 'instance', 'idx_instance_1');
ALTER TABLE `worker_instance`.`instance`
ADD INDEX `idx_instance_1` (`type`, `worker_type`) USING BTREE;
