INSERT INTO history (id, username, event, timestamp)
SELECT id, username, event, timestamp FROM mysql_source.history;

SELECT setval(pg_get_serial_sequence('history', 'id'), COALESCE(max(id), 0) + 1, false) FROM history;
