SELECT *
FROM recipe
WHERE NOT removed
ORDER BY creation_time DESC
         LIMIT 10;