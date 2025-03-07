ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_1` (`username`, `removed`, `name`, `update_time`) USING BTREE;

ALTER TABLE `processing_recipe`.`project`
ADD INDEX `idx_project_1` (`username`, `name`) USING BTREE;

ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_2` (`type`, `type_version`, `removed`, `creation_time`) USING BTREE;

ALTER TABLE `processing_recipe`.`recipe`
ADD INDEX `idx_recipe_3` (`username`, `project_id`) USING BTREE;
