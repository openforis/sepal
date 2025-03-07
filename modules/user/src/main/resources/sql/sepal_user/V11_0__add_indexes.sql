ALTER TABLE `sepal_user`.`sepal_user`
ADD INDEX `idx_sepal_user_1` (`creation_time`) USING BTREE;

ALTER TABLE `sepal_user`.`sepal_user`
DROP INDEX `username`,
ADD UNIQUE `idx_sepal_user_2` (`username`) USING BTREE;

ALTER TABLE `sepal_user`.`sepal_user`
DROP INDEX `email`,
ADD UNIQUE `idx_sepal_user_3` (`email`) USING BTREE;

ALTER TABLE `sepal_user`.`sepal_user`
ADD UNIQUE `idx_sepal_user_4` (`token`) USING BTREE;
