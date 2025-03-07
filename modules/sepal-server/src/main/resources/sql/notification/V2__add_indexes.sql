ALTER TABLE `notification`.`message`
ADD INDEX `idx_message_1` (`removed`, `creation_time`) USING BTREE;

ALTER TABLE `notification`.`notification`
ADD INDEX `idx_notification_1` (`username`, `message_id`) USING BTREE;
