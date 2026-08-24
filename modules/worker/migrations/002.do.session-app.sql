-- session_app — pins a user's app (by catalog path) to the worker session it was started on.
-- One row per (username, app_path): an app is permanently associated with one session until
-- that session closes (rows are deleted when worker_session.state transitions to CLOSED).
CREATE TABLE IF NOT EXISTS worker.`session_app` (
    `username`      varchar(255) NOT NULL,
    `app_path`      varchar(255) NOT NULL,
    `session_id`    varchar(255) NOT NULL,
    `label`         varchar(255) DEFAULT NULL,
    `creation_time` timestamp    NOT NULL,
    PRIMARY KEY (`username`, `app_path`),
    KEY `idx_session_app_1` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
