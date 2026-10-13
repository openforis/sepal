-- Millisecond marks, so a measurement started in the same second as a mark does not clear it.
ALTER TABLE `data_usage` MODIFY `dirty_since` timestamp(3) NULL DEFAULT NULL;
