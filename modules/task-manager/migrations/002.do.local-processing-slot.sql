-- When the task was granted a local processing slot; NULL while it holds none.

ALTER TABLE task ADD COLUMN slot_time timestamp(3) NULL DEFAULT NULL AFTER progress_time;
