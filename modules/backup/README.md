# backup

Nightly backup of the main host's state that exists nowhere else. One cron job dumps Postgres over the
`sepal` network, archives a few host directories, keeps both in `SEPAL_BACKUP_DIR` (`/backup` in the
container) and uploads them to the `S3_BACKUP_BUCKET`.

## What is backed up

- Every Postgres database (`pg_dump -Fc`) and the roles (`pg_dumpall --globals-only`), in `postgres/`
- `files.tar.gz`: `/data/ssh-gateway` (SSH host keys), `/data/user/home` (each user's SEPAL key pair) and
  `/data/app-manager` (`apps.json` and app images)

Everything else under `/data` is left out: user homes (EFS), Jupyter kernels and shared apps (FSx), Redis,
RabbitMQ, pgAdmin, the live Postgres files, and per-task or downloaded working files. Their state is rebuilt
at runtime or held elsewhere.

`pg_dump` must be at least the server's major version, so `script/init_image.sh` installs the client
matching the `postgres` module's image.

## Layout and retention

Each run uploads to `backup/<tier>/<date>/` and, once every file is up, writes a `COMPLETE` object listing
them. A run goes to the most durable tier with no complete backup in its current period: `yearly` (since
1 January), then `monthly` (since the 1st), then `weekly` (since Monday), otherwise `daily`. A failed run at
the start of a period therefore moves that period's backup to the next night.

S3 lifecycle rules, set by `hosting-services/aws/sepal/provision-sepal.yml`, expire `daily` after 7 days,
`weekly` after 35 and `monthly` after 365; `yearly` is kept. The local copy in `SEPAL_BACKUP_DIR` holds the
last run only.

## Restore

Restoring is always manual. Stop the modules using Postgres, then:

```bash
docker exec -it backup /script/restore.sh <date>|latest|local
```

`<date>` and `latest` download a complete backup into `restore/<date>/` under `SEPAL_BACKUP_DIR`; `local`
uses the last run's dumps. The script restores the roles, resets the `postgres` and `sepal` passwords to the
configured ones, and recreates every database in the backup. Host files are not restored: extract
`files.tar.gz` into `/data` on the host.
