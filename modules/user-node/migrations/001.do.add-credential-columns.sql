DROP PROCEDURE IF EXISTS sepal_user.AddColumnIfNotExists;

CREATE PROCEDURE sepal_user.AddColumnIfNotExists(
    IN tableName VARCHAR(255),
    IN columnName VARCHAR(255),
    IN columnDdl TEXT
)
BEGIN
    DECLARE columnExists INT DEFAULT 0;

    SELECT COUNT(*)
    INTO columnExists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'sepal_user'
      AND TABLE_NAME = tableName
      AND COLUMN_NAME = columnName;

    IF columnExists = 0 THEN
        SET @sql_stmt = CONCAT('ALTER TABLE sepal_user.', tableName, ' ADD COLUMN ', columnDdl);
        PREPARE stmt FROM @sql_stmt;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END;

CALL sepal_user.AddColumnIfNotExists('sepal_user', 'password_hash', 'password_hash VARCHAR(255) NULL');
CALL sepal_user.AddColumnIfNotExists('sepal_user', 'ssh_public_key', 'ssh_public_key TEXT NULL');

DROP PROCEDURE IF EXISTS sepal_user.AddColumnIfNotExists;
