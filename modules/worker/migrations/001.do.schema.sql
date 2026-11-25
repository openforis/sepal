CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS worker_session (
    id                     varchar(36)    NOT NULL,
    state                  varchar(16)    NOT NULL,
    username               citext         NOT NULL CHECK (char_length(username) <= 32),
    worker_type            varchar(32)    NOT NULL,
    instance_type          varchar(64)    NOT NULL,
    instance_id            varchar(255)   NOT NULL,
    -- Debugging aid only; consumers derive the name from the instance id.
    instance_name          varchar(64)    DEFAULT NULL,
    host                   varchar(255)   NOT NULL,
    creation_time          timestamptz(0) NOT NULL,
    update_time            timestamptz(0) NOT NULL,
    timeout_time           timestamptz(0) DEFAULT NULL,
    last_interaction_time  timestamptz(0) DEFAULT NULL,
    active_time            timestamptz(0) DEFAULT NULL,
    notification_state     text           NOT NULL DEFAULT 'NONE'
        CHECK (notification_state IN ('NONE', 'NOTIFIED', 'DISMISSED', 'EMAILED')),
    notified_time          timestamptz(0) DEFAULT NULL,
    api_key                varchar(64)    DEFAULT NULL,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX idx_worker_session_api_key ON worker_session (api_key);
CREATE INDEX idx_worker_session_1 ON worker_session (username, worker_type, state, instance_type);
CREATE INDEX idx_worker_session_2 ON worker_session (state, username, update_time);
CREATE INDEX idx_worker_session_3 ON worker_session (instance_id, state);
CREATE INDEX idx_worker_session_4 ON worker_session (username, creation_time, update_time);
CREATE INDEX idx_worker_session_5 ON worker_session (state, timeout_time);

-- Allocation arbitration; the hosting service owns instance inventory.
CREATE TABLE IF NOT EXISTS instance_claim (
    instance_id  varchar(255)   NOT NULL,
    session_id   varchar(36)    NOT NULL,
    claimed_at   timestamptz(0) NOT NULL DEFAULT now(),
    PRIMARY KEY (instance_id)
);

CREATE INDEX idx_instance_claim_1 ON instance_claim (claimed_at);

-- Pins a user's app (by catalog path) to the worker session it was started on, until that session
-- closes. client_id is the gateway ws client (browser window) whose tab owns the association. Nullable:
-- starts made before the ws delivered a clientId have no owner; ownerless rows are never swept on
-- clientDown and never produce takeover notifications.
CREATE TABLE IF NOT EXISTS session_app (
    username       citext         NOT NULL CHECK (char_length(username) <= 32),
    app_path       varchar(255)   NOT NULL,
    session_id     varchar(36)    NOT NULL,
    label          varchar(255)   DEFAULT NULL,
    client_id      varchar(64)    DEFAULT NULL,
    creation_time  timestamptz(0) NOT NULL,
    PRIMARY KEY (username, app_path)
);

CREATE INDEX idx_session_app_1 ON session_app (session_id);

-- One row per (session, sampling tick), written by the instanceUsage sampler. cpu_pct/gpu_pct are 0-100
-- of the WHOLE instance; NULL means "not measured this tick" (first tick after a sampler restart has no
-- counter baseline; GPU only on GPU types). Pruned after USAGE_SAMPLE_RETENTION_DAYS.
CREATE TABLE IF NOT EXISTS instance_usage_sample (
    session_id          varchar(36)    NOT NULL,
    username            citext         NOT NULL CHECK (char_length(username) <= 32),
    instance_type       varchar(64)    NOT NULL,
    sample_time         timestamptz(0) NOT NULL,
    cpu_pct             numeric(5,2)   DEFAULT NULL,
    ram_bytes           bigint         DEFAULT NULL,
    ram_pct             numeric(5,2)   DEFAULT NULL,
    gpu_pct             numeric(5,2)   DEFAULT NULL,
    gpu_ram_bytes       bigint         DEFAULT NULL,
    net_rx_bytes_per_s  bigint         DEFAULT NULL,
    net_tx_bytes_per_s  bigint         DEFAULT NULL,
    PRIMARY KEY (session_id, sample_time)
);

CREATE INDEX idx_instance_usage_sample_1 ON instance_usage_sample (username, sample_time);
CREATE INDEX idx_instance_usage_sample_2 ON instance_usage_sample (sample_time);

-- Per-session hourly aggregates, upserted by the hourly rollup job; feeds the admin usage reports.
-- Pruned after USAGE_HOURLY_RETENTION_DAYS.
CREATE TABLE IF NOT EXISTS instance_usage_hourly (
    session_id           varchar(36)    NOT NULL,
    username             citext         NOT NULL CHECK (char_length(username) <= 32),
    instance_type        varchar(64)    NOT NULL,
    hour                 timestamptz(0) NOT NULL,
    sample_count         integer        NOT NULL,
    cpu_avg              numeric(5,2)   DEFAULT NULL,
    cpu_max              numeric(5,2)   DEFAULT NULL,
    ram_avg              numeric(5,2)   DEFAULT NULL,
    ram_max              numeric(5,2)   DEFAULT NULL,
    gpu_avg              numeric(5,2)   DEFAULT NULL,
    gpu_max              numeric(5,2)   DEFAULT NULL,
    gpu_ram_max          bigint         DEFAULT NULL,
    net_avg_bytes_per_s  bigint         DEFAULT NULL,
    PRIMARY KEY (session_id, hour)
);

CREATE INDEX idx_instance_usage_hourly_1 ON instance_usage_hourly (username, hour);
CREATE INDEX idx_instance_usage_hourly_2 ON instance_usage_hourly (hour);
