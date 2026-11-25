ALTER TABLE instance_claim ADD COLUMN recovery_started_at timestamptz(0) DEFAULT NULL;
