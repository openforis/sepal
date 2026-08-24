-- client_id — the gateway ws client (browser window) whose tab owns the association.
-- Nullable: legacy rows and starts made before the ws delivered a clientId have no owner;
-- ownerless rows are never swept on clientDown and never produce takeover notifications.
ALTER TABLE worker.`session_app`
    ADD COLUMN `client_id` varchar(64) DEFAULT NULL;
