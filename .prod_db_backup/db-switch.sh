#!/usr/bin/env bash
# Flip the dev-env MySQL datadir between the local dev database and the restored
# prod copy. Both live side by side under $SEPAL_DATA_DIR/mysql, so switching is
# a rename plus a module restart - no re-import.
set -euo pipefail

target=${1:-}
case "$target" in
    dev|prod) ;;
    *) echo "usage: $(basename "$0") dev|prod" >&2; exit 1 ;;
esac

MODULES=${MODULES:-:default}
set -a; . "${SEPAL_CONFIG:-$HOME/.sepal}/env"; set +a
MYSQL_DIR="$SEPAL_DATA_DIR/mysql"

current=$(cat "$MYSQL_DIR/db.active" 2>/dev/null || echo dev)
if [ "$current" = "$target" ]; then
    echo "already on '$target'"
    exit 0
fi
if [ ! -d "$MYSQL_DIR/db.$target" ]; then
    echo "no parked datadir at $MYSQL_DIR/db.$target" >&2
    exit 1
fi

echo "==> stopping modules"
docker exec sepal-dev sepal stop "$MODULES"

sudo mv "$MYSQL_DIR/db" "$MYSQL_DIR/db.$current"
sudo mv "$MYSQL_DIR/db.$target" "$MYSQL_DIR/db"
echo "$target" | sudo tee "$MYSQL_DIR/db.active" >/dev/null

echo "==> starting modules on the '$target' database"
docker exec sepal-dev sepal start "$MODULES"
