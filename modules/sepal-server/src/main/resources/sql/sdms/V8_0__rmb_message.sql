CREATE TABLE IF NOT EXISTS rmb_message
(
    id               VARCHAR(127)    NOT NULL,
    sequence_no      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
    publication_time TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queue_id         VARCHAR(127)    NOT NULL,
    message_string   TEXT,
    message_bytes    BLOB,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS rmb_message_processing
(
    message_id    VARCHAR(127) NOT NULL,
    consumer_id   VARCHAR(127) NOT NULL,
    version_id    VARCHAR(127) NOT NULL,
    state         VARCHAR(32)  NOT NULL,
    last_updated  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    times_out     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retries       INT          NOT NULL,
    error_message TEXT,
    PRIMARY KEY (message_id, consumer_id),
    FOREIGN KEY (message_id) REFERENCES rmb_message (id)
);
