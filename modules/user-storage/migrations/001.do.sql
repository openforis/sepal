CREATE TABLE user_storage.history (
  id                    INT(11)     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username              VARCHAR(32) NOT NULL,
  event                 VARCHAR(64) NOT NULL,
  timestamp             TIMESTAMP   NOT NULL
);

DROP PROCEDURE IF EXISTS user_storage.DropIndexIfExists;

CREATE PROCEDURE user_storage.DropIndexIfExists(
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
END;

-- create new indexes

CALL user_storage.DropIndexIfExists('user_storage', 'history', 'idx_history_1');
ALTER TABLE `user_storage`.`history`
ADD INDEX `idx_history_1` (`username`, `timestamp`, `id`) USING BTREE;

CALL user_storage.DropIndexIfExists('user_storage', 'history', 'idx_history_2');
ALTER TABLE `user_storage`.`history`
ADD INDEX `idx_history_2` (`timestamp`) USING BTREE;
