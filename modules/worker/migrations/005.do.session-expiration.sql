-- Session expiration model (docs/session-expiration-model.md).
--
-- Lifetime stops being DERIVED from update_time freshness and becomes a STORED deadline that
-- events ratchet forward. The idle FSM is deleted with its columns.
--
-- DESTRUCTIVE: earliest_timeout_time, idle_state, warned_time and last_user_activity_time are
-- dropped, not migrated. That is safe only because the Node worker has never run in production —
-- on `master` the authoritative tables are still sdms.worker_session / worker_instance.instance.
--
-- last_user_activity_time is dropped rather than renamed to last_interaction_time on purpose: its
-- definition ("any proxied request") is exactly what is being replaced, so carrying the values
-- over would let the new column silently inherit the old meaning.

ALTER TABLE worker.`worker_session`
    ADD COLUMN `timeout_time`          timestamp NULL DEFAULT NULL,
    ADD COLUMN `last_interaction_time` timestamp NULL DEFAULT NULL,
    ADD COLUMN `active_time`           timestamp NULL DEFAULT NULL,
    ADD COLUMN `notification_state`    enum('NONE','NOTIFIED','DISMISSED','EMAILED') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `notified_time`         timestamp NULL DEFAULT NULL;

-- Open sessions predating the migration have no deadline and no activation stamp. Seed both from
-- update_time so the first sweep does not see a NULL deadline (which would never expire) or a NULL
-- cap anchor (which would make the busy ratchet unbounded — §2).
UPDATE worker.`worker_session`
   SET `active_time` = COALESCE(`active_time`, `update_time`),
       `timeout_time` = COALESCE(`timeout_time`, `update_time` + INTERVAL 30 MINUTE)
 WHERE `state` = 'ACTIVE';

-- The sweep scans ACTIVE sessions by deadline; the notification state advances per session.
ALTER TABLE worker.`worker_session`
    ADD KEY `idx_worker_session_6` (`state`, `timeout_time`) USING BTREE;

-- idx_worker_session_3 was (earliest_timeout_time, state, update_time) — the index behind the
-- old derived timeout. Dropped with its leading column.
ALTER TABLE worker.`worker_session`
    DROP KEY `idx_worker_session_3`,
    DROP COLUMN `earliest_timeout_time`,
    DROP COLUMN `idle_state`,
    DROP COLUMN `warned_time`,
    DROP COLUMN `last_user_activity_time`;
