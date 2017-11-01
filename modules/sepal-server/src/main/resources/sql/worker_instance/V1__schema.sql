CREATE SCHEMA IF NOT EXISTS worker_instance;

CREATE TABLE worker_instance.instance (
  id    VARCHAR(255) NOT NULL,
  type  VARCHAR(63)  NOT NULL,
  worker_type VARCHAR(63),
  PRIMARY KEY (id)
);