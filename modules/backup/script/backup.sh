#!/bin/bash
# Dumps every Postgres database and archives the host files that exist nowhere else, keeps both in /backup,
# and uploads them to s3://$S3_BACKUP_BUCKET/backup/<tier>/<date>/. A COMPLETE object marks a run that
# uploaded everything; S3 lifecycle rules expire each tier (see README.md).

umask 077
set -o pipefail
export PGHOST=$POSTGRES_HOST PGUSER=$POSTGRES_USER

LOCAL_DIR=/backup
FILES=(ssh-gateway user/home app-manager)
TIERS=(yearly monthly weekly)

uploads=()
failed=0

main() {
    local date tier
    date=$(date -u +%F)
    echo "Backup started"

    dump_databases
    archive_files
    tier=$(select_tier "$date") || {
        echo "Backup failed: cannot list existing backups"
        exit 1
    }
    upload "backup/$tier/$date"

    if [[ $failed -ne 0 ]]; then
        echo "Backup failed"
        exit 1
    fi
    mark_complete "backup/$tier/$date"
    echo "Backup completed: $tier/$date"
}

dump_databases() {
    local databases db
    mkdir -p "$LOCAL_DIR/postgres"
    databases=$(psql -d postgres -Atc "
        SELECT datname FROM pg_database
        WHERE NOT datistemplate AND datname NOT IN ('postgres')
        ORDER BY datname") || {
        echo "Backup of databases failed: cannot list them"
        failed=1
        return
    }
    for db in $databases; do
        keep "postgres/$db.dump" pg_dump -Fc -f "$LOCAL_DIR/postgres/$db.dump.tmp" "$db"
    done
    keep postgres/globals.sql dump_globals
}

dump_globals() {
    pg_dumpall --globals-only > "$LOCAL_DIR/postgres/globals.sql.tmp"
}

archive_files() {
    keep files.tar.gz tar -czf "$LOCAL_DIR/files.tar.gz.tmp" -C /data "${FILES[@]}"
}

# Runs the command writing <file>.tmp, then promotes it to <file> and queues it for upload.
keep() {
    local file=$1
    shift
    if "$@" && mv "$LOCAL_DIR/$file.tmp" "$LOCAL_DIR/$file"; then
        echo "Backed up $file"
        uploads+=("$file")
    else
        echo "Backup of $file failed"
        rm -f "$LOCAL_DIR/$file.tmp"
        failed=1
    fi
}

# The most durable tier with no complete backup yet in its current period, so a failed run on the first day
# of a period moves that period's backup to the next night instead of losing it.
select_tier() {
    local date=$1 completed tier start
    completed=$(completed_backups) || return 1
    for tier in "${TIERS[@]}"; do
        start="$tier/$(period_start "$tier" "$date")"
        if ! awk -v tier="$tier/" -v start="$start" \
            'index($0, tier) == 1 && $0 >= start {found = 1} END {exit !found}' <<< "$completed"; then
            echo "$tier"
            return
        fi
    done
    echo daily
}

# <tier>/<date> of each complete backup
completed_backups() {
    local keys
    keys=$(aws s3api list-objects-v2 --bucket "$S3_BACKUP_BUCKET" --prefix backup/ \
        --query 'Contents[].Key' --output text) || return 1
    tr '\t' '\n' <<< "$keys" | sed -n 's|^backup/\([a-z]*/[0-9-]*\)/COMPLETE$|\1|p'
}

period_start() {
    local tier=$1 date=$2
    case $tier in
        yearly) echo "${date:0:4}-01-01" ;;
        monthly) echo "${date:0:7}-01" ;;
        weekly) date -u -d "$date -$(($(date -u -d "$date" +%u) - 1)) days" +%F ;;
    esac
}

upload() {
    local prefix=$1 file
    for file in "${uploads[@]}"; do
        if ! aws s3 cp --only-show-errors "$LOCAL_DIR/$file" "s3://$S3_BACKUP_BUCKET/$prefix/$file"; then
            echo "Upload of $file failed"
            failed=1
        fi
    done
}

mark_complete() {
    local prefix=$1
    printf '%s\n' "${uploads[@]}" | aws s3 cp --only-show-errors - "s3://$S3_BACKUP_BUCKET/$prefix/COMPLETE" || {
        echo "Backup failed: cannot mark $prefix complete"
        exit 1
    }
}

main
