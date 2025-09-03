CALL sepal_user.DropIndexIfExists('sepal_user', 'sepal_user', 'idx_sepal_user_3');
ALTER TABLE `sepal_user`.`sepal_user`
ADD UNIQUE `idx_sepal_user_3` (`email`) USING BTREE;
