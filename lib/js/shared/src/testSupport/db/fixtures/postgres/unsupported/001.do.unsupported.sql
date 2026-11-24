CREATE TABLE parent (id integer NOT NULL PRIMARY KEY);

CREATE TABLE child (
  id        integer NOT NULL PRIMARY KEY,
  parent_id integer NOT NULL,
  CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES parent (id)
);
