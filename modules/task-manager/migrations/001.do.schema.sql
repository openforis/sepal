CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS task (
    id                 varchar(36)    NOT NULL,
    state              varchar(16)    NOT NULL,
    username           citext         NOT NULL CHECK (char_length(username) <= 32),
    operation          varchar(255)   NOT NULL,
    params             jsonb          NOT NULL,
    status_description text           NOT NULL,
    recipe_id          varchar(36)    DEFAULT NULL,
    api_key_hash       char(64)       DEFAULT NULL,
    creation_time      timestamptz(3) NOT NULL,
    update_time        timestamptz(3) NOT NULL,
    progress_time      timestamptz(3) DEFAULT NULL,
    slot_time          timestamptz(3) DEFAULT NULL,
    removed            boolean        NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX task_idx_task_api_key ON task (api_key_hash);
CREATE INDEX task_idx_task_state ON task (state, creation_time);
CREATE INDEX task_idx_task_user ON task (username, removed, creation_time);
