#!/usr/bin/env bash
# Remove case-collision duplicates from SEPAL redis stores, keeping the all-lowercase key.
# Dry-run by default; pass --apply to delete. Run with the writing modules stopped.
# BullMQ job keys are deliberately NOT handled here (see bull-case-cleanup.mjs): deleting a
# job hash leaves dangling ids in the queue's delayed/wait/prioritized/completed/failed sets.
set -euo pipefail

APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true
OUT="${OUT_DIR:-.}"

TARGETS="
gateway-redis:0:user
user-storage-redis:0:storage
user-storage-redis:0:session
user-storage-redis:0:lastActive
user-storage-redis:0:lastInactive
user-assets-redis:0:user
user-assets-redis:0:assets
"

total_dup=0 total_orphan=0
for t in $TARGETS; do
    IFS=: read -r container db prefix <<<"$t"
    tag="${container}-db${db}-${prefix}"

    docker exec "$container" redis-cli -n "$db" --scan --pattern "$prefix:*" | tr -d '\r' \
        | awk -v p="$prefix" -v dup="$OUT/$tag.duplicates" -v orph="$OUT/$tag.mixed-only" '
            { u = substr($0, length(p) + 2); low = tolower(u)
              if (u == low) lower[$0] = 1; else mixed[$0] = p ":" low }
            END {
                for (k in mixed)
                    if (mixed[k] in lower) print k > dup
                    else print k > orph
            }'
    touch "$OUT/$tag.duplicates" "$OUT/$tag.mixed-only"
    dup=$(wc -l < "$OUT/$tag.duplicates") orphan=$(wc -l < "$OUT/$tag.mixed-only")

    printf '%-22s db%s %-14s duplicates: %-6s mixed-case-only: %s\n' \
        "$container" "$db" "$prefix:" "$dup" "$orphan"
    total_dup=$((total_dup + dup)) total_orphan=$((total_orphan + orphan))

    if $APPLY && [ "$dup" -gt 0 ]; then
        docker exec -i "$container" sh -c "xargs -r -n 400 redis-cli -n $db DEL" \
            < "$OUT/$tag.duplicates" > /dev/null
        echo "  deleted $dup key(s)"
    fi
done

echo
echo "duplicates (mixed-case key WITH a lowercase twin — deletable): $total_dup"
echo "mixed-case only (no lowercase twin — left alone):              $total_orphan"
echo "key lists written to $OUT/*.duplicates and $OUT/*.mixed-only"
$APPLY || echo "DRY RUN — re-run with --apply to delete"
