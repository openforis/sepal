CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE item (
  id       varchar(36)    NOT NULL PRIMARY KEY,
  username citext         NOT NULL,
  note     text,
  flag     boolean        NOT NULL,
  doc      jsonb,
  at       timestamptz(3)
);

CREATE TABLE tag (
  name varchar(32) NOT NULL PRIMARY KEY,
  kind text        NOT NULL
);
