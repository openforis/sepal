CREATE TABLE parent (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB;

CREATE TABLE child (
  id        INT NOT NULL PRIMARY KEY,
  parent_id INT NOT NULL,
  CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES parent (id)
) ENGINE=InnoDB;
