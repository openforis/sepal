CREATE TABLE reference_item (
  id   INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL
);

-- The third row is inserted and removed, so the baseline counter (31) sits above the largest stored id
-- (20). Re-inserting the surviving rows cannot reproduce that; only restoring the counter can.
INSERT INTO reference_item (id, name) VALUES (10, 'first'), (20, 'second'), (30, 'gone before the baseline');
DELETE FROM reference_item WHERE id = 30;

CREATE TABLE recorded_event (
  id   VARCHAR(36) NOT NULL PRIMARY KEY,
  note VARCHAR(64) NOT NULL
);
