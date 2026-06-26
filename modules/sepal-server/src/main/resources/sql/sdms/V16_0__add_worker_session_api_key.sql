ALTER TABLE worker_session
  ADD COLUMN api_key VARCHAR(64) NULL;

CREATE UNIQUE INDEX idx_worker_session_api_key ON worker_session(api_key);
