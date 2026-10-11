# Running dev-env against the prod dump

`dump.sql` is a 19 GiB full mysqldump of prod (MySQL 5.7.44 — same version the
`mysql` module runs, so it restores natively).

The dev-env datadir is a bind mount (`$SEPAL_DATA_DIR/mysql/db` →
`/var/lib/mysql`), so prod is restored into a *separate* datadir and the two are
swapped by renaming directories. The dev database is never written to, and
switching back costs a restart instead of a re-import.

    $SEPAL_DATA_DIR/mysql/db          active datadir (bind-mounted)
    $SEPAL_DATA_DIR/mysql/db.dev      parked dev datadir
    $SEPAL_DATA_DIR/mysql/db.prod     parked prod datadir
    $SEPAL_DATA_DIR/mysql/db.active   marker: "dev" or "prod"

## One-time restore

    .prod_db_backup/db-restore-prod.sh

Stops `:default`, parks the dev datadir, starts `mysql` on an empty one (the
image re-initialises it from `MYSQL_ROOT_PASSWORD`/`MYSQL_USER`), streams the
dump in, and leaves you on prod. Expect a few hours.

## Switching

    .prod_db_backup/db-switch.sh dev     # back to the local database
    .prod_db_backup/db-switch.sh prod    # back to the prod copy

## Throwing the prod copy away

    docker exec sepal-dev sepal stop :default
    sudo rm -rf $SEPAL_DATA_DIR/mysql/db.prod     # after switching to dev

## What gets skipped, and why

`SKIP_SCHEMAS` defaults to `mysql`: prod's user/grant tables would replace the
dev root password every module authenticates with (`MYSQL_USER: root` in each
module's compose file).

`SKIP_TABLE_DATA` drops rows but keeps the `CREATE TABLE`. Defaults are
prod-only leftovers. Largest tables in the dump:

    7.9 GiB  sdms.task                       → copied into worker.task on start
    5.9 GiB  sdms.scene_meta_data            → skipped by default; scene-metadata rebuilds its own schema
    2.4 GiB  processing_recipe.recipe
    2.0 GiB  sdms.scene_meta_data_backup2    → skipped by default
    678 MiB  processing_recipe.recipe_bak    → skipped by default
     78 MiB  sdms.user_monthly_storage       → copied into budget on start
     35 MiB  processing_recipe.recipe_corrupted_ids  → skipped by default
     33 MiB  sdms.worker_session             → copied into worker.worker_session on start

Disk is the binding constraint — ~40 GiB free. The defaults drop ~8.6 GiB of
rows. To keep one of them after all, restate the list without it:

    SKIP_TABLE_DATA="sdms.scene_meta_data_backup2 processing_recipe.recipe_bak \
        processing_recipe.recipe_corrupted_ids" \
        .prod_db_backup/db-restore-prod.sh

## What to expect once the modules come up on prod data

The dump predates this branch's schema split, so it carries `sdms`,
`worker_instance` and `notification`, but no `worker`, `budget`, `message` or
`scene_metadata`. On first start Postgrator creates those, and:

- `worker/migrations/001` copies `sdms.worker_session` and `sdms.task` into
  `worker` — that duplicates the 7.9 GiB task table, so budget for it.
- `budget/migrations/001` copies `user_budget`, `default_user_budget` and
  `user_monthly_storage` out of `sdms`.
- `message/migrations/001` creates empty tables; prod's `notification` schema is
  *not* migrated into `message`.
- `sepal_user` and `processing_recipe` exist in the dump and are migrated in
  place, so the restored copy is modified by the first start. That is fine for a
  throwaway datadir, but means the prod copy drifts from `dump.sql`.
