# MySQL 5.7 → PostgreSQL: impact evaluation

**Date:** 2026-08-28
**Scope:** every module, migration and script that touches the database, plus the ops surface
around the `mysql` and `mysql-backup` modules.

**Verdict:** the surface is small and well-contained — ~137 query sites, one shared driver file,
7 migration directories. Three areas carry real risk: `scene-metadata`'s bulk ingest, the mysql2
result-metadata semantics that worker and budget correctness rest on, and migrating 19 GiB of live
prod data out of the still-present Java-era schemas. Roughly 4–6 focused weeks.

If the driver is MySQL 5.7 being EOL, a MySQL 8.4 upgrade is 2–4 days and achieves the same thing.
See §8.

## 1. The surface

| | |
|---|---|
| Driver / migration runner | `lib/js/shared/src/db/mysql.js` — one file, mysql2 + Postgrator |
| Modules touching the DB | `worker`, `budget`, `recipe`, `message`, `user`, `user-storage`, `scene-metadata` |
| Repository code | 13 files, ~2100 lines, **~137 `.query()` / `.execute()` sites** |
| Migrations | 7 directories, ~510 lines of SQL |
| Infrastructure | `modules/mysql/`, `modules/mysql-backup/`, phpMyAdmin, `.prod_db_backup/` scripts |

Query sites by file:

| File | Sites |
|---|---|
| `modules/worker/src/workerSession/workerSessionRepository.js` | 23 |
| `modules/budget/src/budgetRepository.js` | 20 |
| `modules/user/src/userRepository.js` | 19 |
| `modules/scene-metadata/src/database.js` | 15 |
| `modules/recipe/src/recipeRepository.js` | 13 |
| `modules/worker/src/task/taskRepository.js` | 9 |
| `modules/worker/src/workerSession/sessionAppRepository.js` | 9 |
| `modules/worker/src/instanceUsage/usageRepository.js` | 7 |
| `modules/message/src/messageRepository.js` | 7 |
| `modules/user-storage/src/database.js` | 5 |
| `modules/worker/src/workerInstance/instanceRepository.js` | 5 |
| `modules/budget/src/openSessionUse.js` | 4 |
| `modules/scene-metadata/src/sceneRepository.js` | 1 |

## 2. What the move gives us for free

- **Postgrator supports `pg` natively.** The migration runner keeps its shape; `driver: 'mysql'`
  becomes `'pg'`.
- **MySQL databases map cleanly onto Postgres schemas** inside one database. Cross-schema joins
  become legal, which is what the budget / worker / recipe migrations currently fake with
  `information_schema` existence guards.
- **`GREATEST` / `LEAST` / `COALESCE` are identical.** The entire session-expiration ratchet's SQL
  primitives survive untouched.
- **`UPDATE … RETURNING`** removes the extra read at `workerSessionRepository.js:394` and the
  `insertId` round-trip at `userRepository.js:159`.
- **Transactional DDL** makes `scene-metadata`'s table swap genuinely atomic instead of relying on
  MySQL's multi-table `RENAME TABLE`.
- The MySQL fractional-`INTERVAL` rounding workaround documented at
  `workerSessionRepository.js:342` becomes unnecessary — Postgres handles fractional intervals
  correctly.

## 3. Mechanical work — small individually, touches everything

- **`?` → `$n`** at all ~137 sites. Best done as a translation shim in the shared lib rather than
  137 edits, but the shim must handle mysql2's nested-array bulk-`VALUES ?` expansion, which `pg`
  has no analogue for (`scene-metadata/src/database.js:185`).
- **`ON DUPLICATE KEY UPDATE … VALUES(col)`** → `ON CONFLICT (…) DO UPDATE SET col = EXCLUDED.col`.
  8 sites across `budget`, `message`, `worker`; each needs an explicit conflict target and several
  are composite primary keys.
- **`NOW() + INTERVAL ? MINUTE`** — Postgres cannot parameterise the unit. ~10 sites, almost all in
  `workerSessionRepository` → `now() + make_interval(mins => $1)`.
- `IFNULL` → `COALESCE` (3 sites), `IF(a,b,c)` → `CASE WHEN` (3 sites, all in the ratchet).
- **All 7 migrations rewritten**: backticks, `ENGINE=InnoDB`, inline `KEY … USING BTREE` (Postgres
  needs separate `CREATE INDEX` statements), and type mapping for `int(11)`, `tinyint(1)`, `double`,
  `longtext`, `smallint(6)`, `enum(…)`.
- The four **copy-from-legacy guards** (`SET @var := SELECT IF(…)` + `PREPARE` / `EXECUTE`) become
  `DO $$ … $$` PL/pgSQL blocks. Straightforward, but they *are* the migration path off `sdms`,
  `processing_recipe` and `worker_instance`, so each must be re-verified against real legacy data.
- `user` and `user-storage` migrations use stored procedures (`AddColumnIfNotExists`,
  `DropIndexIfExists`) with dynamic SQL — same `DO $$ … $$` treatment.

## 4. The three things that need care

### 4.1 mysql2 result metadata is load-bearing for correctness

70 uses of `affectedRows`, 10 of `changedRows`, 2 of `insertId`.

`affectedRows` → `rowCount` is fine — both count matched rows. **`changedRows` has no Postgres
equivalent**, and `instanceRepository.js:46-55` depends on it explicitly:

> mysql2 defaults to CLIENT_FOUND_ROWS, so affectedRows would count the matched row and wrongly
> return true on a double-release. changedRows parses "Changed: N" from the OK packet: 0 on a
> double-release, 1 on a real one — the sentinel ReleaseInstance uses to gate undeploy.

Postgres `rowCount` counts rows the UPDATE wrote, including writes where the value did not change.
Ported naively, `released()` returns `true` on a double-release and undeploy fires twice. The fix is
to push the guard into the `WHERE` clause or use `RETURNING`. **This is a silent-bug spot, not a
compile error.**

### 4.2 `extendSession` depends on MySQL's SET-clause evaluation order

`workerSessionRepository.js:362-364` documents the invariant:

> MySQL evaluates SET clauses left to right and later ones see the values written by earlier ones,
> so the conditional columns must come BEFORE timeout_time or their comparison would read the
> deadline this very statement just wrote.

**Postgres evaluates all SET expressions against the old row simultaneously.** The intended
semantics come for free — but the invariant inverts and the comment becomes wrong. The statement
also uses `IF(…)` three times and passes `interaction ? 1 : 0` where Postgres needs a real boolean.
Needs a deliberate re-read plus the integration tests to confirm the ratchet still behaves.

### 4.3 scene-metadata is a rewrite, not a port

`modules/scene-metadata/src/database.js` is the single hardest file:

- `LOAD DATA INFILE … SET acquisition_date = STR_TO_DATE(…)` — `COPY` cannot transform columns.
  Needs `COPY` into an all-text staging table, then `INSERT … SELECT` with casts.
- `LOAD DATA … IGNORE` and `INSERT IGNORE` → staging plus `ON CONFLICT DO NOTHING`.
- `ENGINE=MyISAM` was chosen *because* `LOAD DATA` is fastest into it (see the migration's own
  comment). That rationale disappears; the analogue is an `UNLOGGED` table promoted with
  `SET LOGGED`.
- `SET GLOBAL innodb_flush_log_at_trx_commit` / `SET sql_log_bin` → drop. Session-level
  `synchronous_commit` covers the intent and needs no SUPER privilege.
- Multi-table atomic `RENAME TABLE a TO old, b TO a` → two `ALTER TABLE … RENAME` in one
  transaction. Postgres DDL is transactional, so this is an improvement.
- This is also the perf-critical path: the scoring query at `sceneRepository.js:41-52` runs over the
  full USGS/Copernicus rebuild. Needs real benchmarking, not assumption.

Silver lining: scene-metadata's data is **purely derived** and its migration copies nothing from the
legacy schema — it can simply be re-ingested rather than migrated.

## 5. Cross-cutting risks

**Timestamp contract.** `timestamptz` vs `timestamp`, and `pg` returns JS `Date`s in the
connection's timezone. Today only 4 modules set `TZ` explicitly and the mysql2 pool has no
`timezone` option, so the UTC contract is upheld by convention plus `toISOString()` at the API
boundary. Postgres changes the failure mode from "obviously wrong" to "silently off by hours".
Needs an explicit decision — `timestamptz` everywhere plus `TZ=UTC` in every container — and tests.

**Collation and case sensitivity.** Schemas are `utf8mb4_unicode_ci`, i.e. case-*insensitive*. Only
the `user` module normalises with `LOWER()` (10 sites); the other 12 repositories compare
`username = ?` raw and rely on `ci` matching. Postgres is case-sensitive by default. Every username
comparison needs auditing, or a `citext` / lowercase-on-write policy.

**`tinyint(1)` → boolean** changes result shape (0/1 → true/false). `!!rows[0].enabled` at
`userRepository.js:44` is safe; the rest need a sweep. `sepal_user`'s base schema alone has six
`tinyint` columns, and is still `DEFAULT CHARSET=latin1`.

**Prod data migration.** 19 GiB dump (`.prod_db_backup/README.md`). `pgloader` handles
MySQL → Postgres well, but the copy-from-legacy migrations require `sdms` and friends to land in
Postgres too — otherwise they are rewritten as one-shot ETL. Get a per-table size breakdown first:
much of that 19 GiB is likely derived scene metadata that should not be migrated at all.

**Ops fan-out.** `modules/mysql` Dockerfile / supervisord / init scripts, `mysql-backup`
(`mysqldump` → `pg_dump`), phpMyAdmin → pgAdmin, the `.prod_db_backup/` restore and switch scripts,
`MYSQL_*` env vars in 7 compose files, `PORTS.txt` 3306 → 5432,
`modules/ops/script/build-and-push-images.sh`, the monit dockercheck symlink, and
`dev-env/config/deps.json`.

**The test safety net exists and must be ported.** The `*.integration.test.js` suites in `worker`
and `budget` run production SQL against real scratch schemas — they are what would catch the ratchet
and release-semantics regressions above. They only run when `MYSQL_PASSWORD` is set, i.e. under
`sepal npm-test <module>` in dev-env. Their existence is the main reason this is feasible at all.

## 6. Effort

Roughly **4–6 focused weeks** for one person, plus a cutover rehearsal against the prod dump.

| Area | Days |
|---|---|
| Shared driver + placeholder shim | 1–2 |
| 7 migration rewrites + legacy copy-guards | 2–3 |
| 13 repositories, ~137 sites | 4–6 |
| `affectedRows` / `changedRows` / `insertId` audit | 1–2 |
| scene-metadata ingest rewrite + perf validation | 3–5 |
| Timestamp + collation contract | 2–3 |
| Ops / infra / backup / compose | 2–3 |
| Prod data migration + rehearsal | 3–5 |

## 7. Suggested sequencing

1. Per-table size breakdown of the prod dump — decides how much data actually has to move.
2. Port the shared driver plus the `message` module end to end (7 sites, 2 tables, no legacy copy).
   Smallest possible full vertical slice; proves the shim, the migration rewrite and the test story.
3. `recipe`, then `user-storage`, then `user` — increasing legacy-schema entanglement.
4. `budget` and `worker` together, driven by their integration suites. §4.1 and §4.2 live here.
5. `scene-metadata` last, with benchmarking, since its data can be rebuilt if the ingest is wrong.
6. Ops, backup and cutover rehearsal.

## 8. The question worth asking first

The `mysql` module pins `FROM mysql:5.7`, EOL since October 2023. If **that** is the driver, a
**MySQL 8.4 upgrade is 2–4 days plus a dump/restore rehearsal** rather than 4–6 weeks. Everything in
§3 and §4 survives an 8.x upgrade untouched. The real 5.7 → 8.0 breakages here are small: the
default collation change (`utf8mb4_0900_ai_ci`), `int(11)` display-width deprecation, and stricter
`GROUP BY` handling. MariaDB is similarly close to drop-in.

Postgres earns the 4–6 weeks only if we want what Postgres specifically gives:

- **JSONB** for `recipe.contents` and `task.params`, currently `LONGTEXT`. There is zero `JSON_*`
  usage today, so no existing dependency — but this is the strongest future argument.
- **PostGIS** for scene-area geometry.
- Transactional DDL and `RETURNING`, both of which the code already works around.

Those are genuine, but they are a feature argument, not a maintenance one.

**Recommendation:** unless JSONB or PostGIS are actually on the roadmap, take MySQL 8.4 now and
revisit Postgres as a deliberate, feature-driven project.
