#!/bin/bash
# Restores the Postgres roles and databases of one backup, replacing the current ones. Run it by hand, with
# the modules using Postgres stopped:
#
#   docker exec -it backup /script/restore.sh <date>|latest|local
#
# <date> and latest download a complete backup from S3 into /backup/restore/<date>; local restores the
# dumps of the last run kept in /backup/postgres. Host files are not restored: on the host, extract
# files.tar.gz into /data.

set -e
set -o pipefail
umask 077
export PGHOST=$POSTGRES_HOST PGUSER=$POSTGRES_USER

LOCAL_DIR=/backup

main() {
    local source=$1 dir
    case $source in
        local) dir=$LOCAL_DIR ;;
        latest | [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) dir=$(download "$source") ;;
        *)
            echo "Usage: $0 <date>|latest|local"
            exit 1
            ;;
    esac
    restore_roles "$dir/postgres/globals.sql"
    restore_databases "$dir/postgres"
    echo "Backup restored from $dir"
    [[ -f $dir/files.tar.gz ]] && echo "Host files: extract $dir/files.tar.gz (/backup is SEPAL_BACKUP_DIR on the host) into /data"
    return 0
}

download() {
    local wanted=$1 backup dir
    backup=$(find_backup "$wanted")
    [[ -n $backup ]] || {
        echo "No complete backup for $wanted" >&2
        exit 1
    }
    dir=$LOCAL_DIR/restore/${backup#*/}
    echo "Downloading backup/$backup to $dir" >&2
    aws s3 cp --only-show-errors --recursive "s3://$S3_BACKUP_BUCKET/backup/$backup/" "$dir/" >&2
    echo "$dir"
}

# <tier>/<date> of the newest complete backup, or of the complete backup taken on the wanted date
find_backup() {
    local wanted=$1 keys
    keys=$(aws s3api list-objects-v2 --bucket "$S3_BACKUP_BUCKET" --prefix backup/ \
        --query 'Contents[].Key' --output text)
    tr '\t' '\n' <<< "$keys" \
        | sed -n 's|^backup/\([a-z]*/[0-9-]*\)/COMPLETE$|\1|p' \
        | awk -F/ -v wanted="$wanted" 'wanted == "latest" || $2 == wanted' \
        | sort -t/ -k2 | tail -1
}

# postgres and sepal already exist in a fresh cluster; their other attributes still come from the backup.
# The configured passwords win over the backed-up ones, which may come from another environment. Both run in
# one session, because the backed-up postgres password would reject any later connection.
restore_roles() {
    local globals=$1
    echo "Restoring roles"
    {
        grep -vxE 'CREATE ROLE (postgres|sepal);' "$globals"
        cat <<'SQL'
\getenv root_password POSTGRES_ROOT_PASSWORD
\getenv sepal_password POSTGRES_PASSWORD
ALTER ROLE postgres PASSWORD :'root_password';
ALTER ROLE sepal PASSWORD :'sepal_password';
SQL
    } | psql -v ON_ERROR_STOP=1 -q -d postgres
}

restore_databases() {
    local dir=$1 dump
    for dump in "$dir"/*.dump; do
        echo "Restoring $dump"
        pg_restore --clean --if-exists --create -d postgres "$dump"
    done
}

main "$@"
