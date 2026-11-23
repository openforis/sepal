INSERT INTO message (id, username, subject, contents, type, creation_time, update_time, removed, priority)
SELECT id, username, subject, contents, type, creation_time, update_time, removed <> 0, priority FROM mysql_source.message;

INSERT INTO notification (message_id, username, state)
SELECT message_id, username, state FROM mysql_source.notification;
