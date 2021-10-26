CREATE TABLE IF NOT EXISTS budget_update_request
(
    id               VARCHAR(255) NOT NULL,
    username         VARCHAR(255) NOT NULL,
    state            VARCHAR(255) NOT NULL,
    message          TEXT         NOT NULL,
    initial_monthly_instance INT          NOT NULL,
    initial_monthly_storage  INT          NOT NULL,
    initial_storage_quota    INT          NOT NULL,
    requested_monthly_instance INT          NOT NULL,
    requested_monthly_storage  INT          NOT NULL,
    requested_storage_quota    INT          NOT NULL,
    final_monthly_instance INT          NOT NULL,
    final_monthly_storage  INT          NOT NULL,
    final_storage_quota    INT          NOT NULL,
    creation_time    TIMESTAMP    NOT NULL,
    update_time      TIMESTAMP    NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX idx_budget_update_request_1
    ON budget_update_request (username, state);
