INSERT INTO item (id, username, note, flag, doc, at)
SELECT id, username, note, flag <> 0, doc::jsonb, at FROM mysql_source.item;

INSERT INTO tag (name, kind)
SELECT name, kind FROM mysql_source.tag;
