#!/usr/bin/env bash
# One-time restore of .prod_db_backup/dump.sql into its own MySQL data directory.
#
# The dev database is not overwritten: it is parked as $SEPAL_DATA_DIR/mysql/db.dev
# and the prod copy is built in a freshly initialised datadir. Afterwards
# db-switch.sh flips between the two with a rename.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
DUMP=${DUMP:-$here/dump.sql}
# The `mysql` system schema must be skipped: it is prod's user/grant table and
# would replace the dev root password the modules authenticate with.
SKIP_SCHEMAS=${SKIP_SCHEMAS:-mysql}
# Tables whose rows are dropped while the CREATE TABLE is kept. The defaults are
# prod-only leftovers, plus scene_meta_data: scene-metadata rebuilds its own
# schema from a crawl and never reads the sdms table. Saves ~8.6 GiB.
SKIP_TABLE_DATA=${SKIP_TABLE_DATA:-sdms.scene_meta_data sdms.scene_meta_data_backup2 processing_recipe.recipe_bak processing_recipe.recipe_corrupted_ids}
MODULES=${MODULES:-:default}

set -a; . "${SEPAL_CONFIG:-$HOME/.sepal}/env"; set +a
MYSQL_DIR="$SEPAL_DATA_DIR/mysql"
ACTIVE="$MYSQL_DIR/db"

if [ ! -f "$DUMP" ]; then
    echo "no dump at $DUMP" >&2
    exit 1
fi
if [ -d "$MYSQL_DIR/db.dev" ]; then
    echo "$MYSQL_DIR/db.dev already exists - use db-switch.sh instead" >&2
    exit 1
fi

printf 'dump %d GiB, free %d GiB\n  skip schemas: %s\n  skip rows of: %s\n' \
    $(($(stat -c%s "$DUMP") / 1073741824)) \
    $(($(df -B1 --output=avail "$MYSQL_DIR" | tail -1) / 1073741824)) \
    "$SKIP_SCHEMAS" "$SKIP_TABLE_DATA"
read -rp 'proceed? [y/N] ' reply
if [ "$reply" != y ]; then
    exit 1
fi

echo '==> stopping modules'
docker exec sepal-dev sepal stop "$MODULES"

echo '==> parking the dev datadir'
sudo mv "$ACTIVE" "$MYSQL_DIR/db.dev"
sudo install -d -o 999 -g 999 "$ACTIVE"

echo '==> starting mysql on the empty datadir (fresh initialisation)'
docker exec sepal-dev sepal start mysql
for _ in $(seq 1 150); do
    if docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysqladmin -uroot ping >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot -e '
    SET GLOBAL max_allowed_packet = 1073741824;
    SET GLOBAL innodb_flush_log_at_trx_commit = 2;'

echo '==> importing'
started=$(date +%s)
while sleep 60; do
    printf '    %s restored, %d min elapsed\n' \
        "$(sudo du -sh "$ACTIVE" | cut -f1)" $((($(date +%s) - started) / 60))
done &
progress=$!
trap 'kill $progress 2>/dev/null || true' EXIT

gawk -v skip="$SKIP_SCHEMAS" -v skipdata="$SKIP_TABLE_DATA" '
    BEGIN {
        n = split(skip, a, " "); for (i = 1; i <= n; i++) dropSchema[a[i]] = 1
        n = split(skipdata, a, " "); for (i = 1; i <= n; i++) dropData[a[i]] = 1
    }
    /^-- Current Database: / {
        match($0, /`([^`]+)`/, m); db = m[1]
        skippingSchema = (db in dropSchema); skippingData = 0
    }
    /^-- Table structure for table / {skippingData = 0}
    /^-- Dumping data for table / {
        match($0, /`([^`]+)`/, m)
        skippingData = ((db "." m[1]) in dropData) || (m[1] in dropData)
    }
    !skippingSchema && !skippingData
' "$DUMP" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
    mysql -uroot --binary-mode --max-allowed-packet=1G

kill $progress 2>/dev/null || true
trap - EXIT

docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot -e '
    SET GLOBAL innodb_flush_log_at_trx_commit = 1;'
echo prod | sudo tee "$MYSQL_DIR/db.active" >/dev/null

echo "==> imported in $((($(date +%s) - started) / 60)) min; starting modules"
docker exec sepal-dev sepal start "$MODULES"
echo 'now on the prod database - "db-switch.sh dev" goes back'
