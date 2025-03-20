DROP PROCEDURE IF EXISTS processing_recipe.DropIndexIfExists;

DELIMITER $$

CREATE PROCEDURE processing_recipe.DropIndexIfExists(
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

-- recipe

CALL processing_recipe.DropIndexIfExists('processing_recipe', 'recipe', 'idx_recipe_1');
ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_1` (`username`, `removed`, `name`, `update_time`) USING BTREE;

CALL processing_recipe.DropIndexIfExists('processing_recipe', 'recipe', 'idx_recipe_2');
ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_2` (`type`, `type_version`, `removed`, `creation_time`) USING BTREE;

CALL processing_recipe.DropIndexIfExists('processing_recipe', 'recipe', 'idx_recipe_3');
ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_3` (`username`, `project_id`) USING BTREE;

-- project

CALL processing_recipe.DropIndexIfExists('processing_recipe', 'project', 'idx_project_1');
ALTER TABLE `processing_recipe`.`project`
ADD INDEX `idx_project_1` (`username`, `name`) USING BTREE;
