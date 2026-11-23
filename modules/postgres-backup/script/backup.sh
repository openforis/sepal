#!/bin/bash

umask 077

# scene is rebuilt from the external catalogues
databases=$(psql -d postgres -Atc "
    SELECT datname FROM pg_database
    WHERE NOT datistemplate AND datname NOT IN ('postgres', 'scene')
    ORDER BY datname") || { echo "Backup failed: cannot list databases"; exit 1; }

echo "Backup started"
failed=0

for db in $databases; do
    if pg_dump -Fc -f "/backup/$db.dump.tmp" "$db" && mv "/backup/$db.dump.tmp" "/backup/$db.dump"; then
        echo "Backed up $db"
    else
        echo "Backup of $db failed"
        rm -f "/backup/$db.dump.tmp"
        failed=1
    fi
done

if pg_dumpall --globals-only > /backup/globals.sql.tmp && mv /backup/globals.sql.tmp /backup/globals.sql; then
    echo "Backed up globals"
else
    echo "Backup of globals failed"
    rm -f /backup/globals.sql.tmp
    failed=1
fi

if [[ $failed -ne 0 ]]; then
    echo "Backup failed"
    exit 1
fi
echo "Backup completed"
