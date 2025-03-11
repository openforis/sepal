DROP PROCEDURE IF EXISTS sepal_user.DropIndexIfExists;

DELIMITER $$

CREATE PROCEDURE sepal_user.DropIndexIfExists(
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

-- unneeded indexes

CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'username');
CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'email');

-- create new indexes

CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'idx_sepal_user_1');
ALTER TABLE `sepal_user`.`sepal_user`
ADD INDEX `idx_sepal_user_1` (`creation_time`) USING BTREE;

CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'idx_sepal_user_2');
ALTER TABLE `sepal_user`.`sepal_user`
ADD UNIQUE `idx_sepal_user_2` (`username`) USING BTREE;

CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'idx_sepal_user_3');
ALTER TABLE `sepal_user`.`sepal_user`
ADD INDEX `idx_sepal_user_3` (`email`) USING BTREE;

CALL processing_recipe.DropIndexIfExists('sepal_user', 'sepal_user', 'idx_sepal_user_4');
ALTER TABLE `sepal_user`.`sepal_user`
ADD UNIQUE `idx_sepal_user_4` (`token`) USING BTREE;
