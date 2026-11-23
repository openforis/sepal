CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS user_budget (
    username         citext   NOT NULL CHECK (char_length(username) <= 32),
    monthly_instance integer  NOT NULL,
    monthly_storage  integer  NOT NULL,
    storage_quota    integer  NOT NULL,
    PRIMARY KEY (username)
);

-- A single row, deliberately without a primary key
CREATE TABLE IF NOT EXISTS default_user_budget (
    monthly_instance integer NOT NULL,
    monthly_storage  integer NOT NULL,
    storage_quota    integer NOT NULL
);

CREATE TABLE IF NOT EXISTS user_monthly_storage (
    username     citext           NOT NULL CHECK (char_length(username) <= 32),
    year         integer          NOT NULL,
    month        integer          NOT NULL,
    gb_hours     double precision NOT NULL,
    storage_used double precision NOT NULL,
    update_time  timestamptz(0)   NOT NULL,
    PRIMARY KEY (username, year, month)
);

CREATE TABLE IF NOT EXISTS user_spending (
    username          citext           NOT NULL CHECK (char_length(username) <= 32),
    instance_spending double precision NOT NULL DEFAULT 0,
    storage_spending  double precision NOT NULL DEFAULT 0,
    storage_usage     double precision NOT NULL DEFAULT 0,
    PRIMARY KEY (username)
);

CREATE TABLE IF NOT EXISTS budget_update_request (
    id                         varchar(36)    NOT NULL,
    username                   citext         NOT NULL CHECK (char_length(username) <= 32),
    state                      varchar(16)    NOT NULL,
    message                    text           NOT NULL,
    initial_monthly_instance   integer        NOT NULL,
    initial_monthly_storage    integer        NOT NULL,
    initial_storage_quota      integer        NOT NULL,
    requested_monthly_instance integer        NOT NULL,
    requested_monthly_storage  integer        NOT NULL,
    requested_storage_quota    integer        NOT NULL,
    final_monthly_instance     integer,
    final_monthly_storage      integer,
    final_storage_quota        integer,
    creation_time              timestamptz(0) NOT NULL,
    update_time                timestamptz(0) NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX budget_update_request_idx_budget_update_request_1 ON budget_update_request (username, state);
CREATE INDEX budget_update_request_idx_budget_update_request_2 ON budget_update_request (state);

-- Event-sourced instance use (WorkerSessionActivated/Closed); the hourly reconciler heals drift.
CREATE TABLE IF NOT EXISTS open_session_use (
    session_id    varchar(36)    NOT NULL,
    username      citext         NOT NULL CHECK (char_length(username) <= 32),
    instance_type varchar(64)    NOT NULL,
    from_time     timestamptz(0) NOT NULL,
    to_time       timestamptz(0),   -- NULL while the session is open
    PRIMARY KEY (session_id)
);

CREATE INDEX open_session_use_idx_open_session_use_1 ON open_session_use (username, from_time);
CREATE INDEX open_session_use_idx_open_session_use_2 ON open_session_use (to_time);
