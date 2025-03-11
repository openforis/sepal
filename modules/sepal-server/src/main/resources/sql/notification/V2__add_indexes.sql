DROP PROCEDURE IF EXISTS notification.DropIndexIfExists;

DELIMITER $$

CREATE PROCEDURE notification.DropIndexIfExists(
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

-- message

CALL notification.DropIndexIfExists('notification', 'message', 'idx_message_1');
ALTER TABLE `notification`.`message`
ADD INDEX `idx_message_1` (`removed`, `creation_time`) USING BTREE;

-- notification

CALL notification.DropIndexIfExists('notification', 'notification', 'idx_notification_1');
ALTER TABLE `notification`.`notification`
ADD INDEX `idx_notification_1` (`username`, `message_id`) USING BTREE;
