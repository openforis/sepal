# Deploying SEPAL locally

> [!NOTE]
> This document describes how to bring up a **local development instance of SEPAL from `master`**,
> on a single Linux machine, using the project's own `sepal` CLI. It is a field report: every step
> below was actually executed, and the workarounds documented here were needed because of genuine
> bugs in the current state of the repository, not because of misconfiguration.

> [!WARNING]
> **The processing stack does not currently build.** `geospatial-toolkit` fails, which blocks
> `sandbox`, `sepal-server` and `gee`. You can get a working platform with authentication, the web
> UI, file management and the terminal — but not the geospatial recipes. See
> [Known blockers](#known-blockers).

---

## What you get

| Working | Not working |
|---|---|
| HTTPS entry point (Caddy, self-signed) | `geospatial-toolkit` (build failure) |
| Web UI (`gui`) | `sandbox`, `task` images |
| Login / accounts (`user-node`, `gateway`) | `sepal-server` (processing recipes) |
| `user-files`, `user-assets`, `user-storage` | `gee` (Earth Engine integration) |
| `terminal`, `ssh-gateway`, `app-launcher` | `app-manager` (needs `sandbox-base` chain) |
| `email`, `scene-metadata`, `ceo-gateway`, `sys-monitor` | |

---

## Prerequisites

- Linux host with Docker Engine and Compose v2
- ~40 GB free disk for the base stack (~110 GB if you attempt the sandbox chain)
- 8 GB RAM minimum, 16 GB recommended
- Ports `80` and `443` free on the host

> [!IMPORTANT]
> The project's build tooling assumes your host user is **UID 1000**. If it is not, `sepal build`
> will fail on every Node module. See [Host UID is not 1000](#host-uid-is-not-1000) for the
> workaround. Check with `id -u`.

---

## Step 1 — Host preparation

### 1.1 AppArmor (Ubuntu 24.04 and later)

> [!CAUTION]
> On Ubuntu 24.04+ with recent Docker, **`docker stop` fails on every container** with
> `permission denied`. This is a host-level regression, unrelated to SEPAL, but it will break
> `sepal stop` and `sepal restart`.

The `apparmor` package ships `/etc/apparmor.d/runc`, which gives `runc` the AppArmor label `runc`
instead of `unconfined`. Docker's `docker-default` profile only accepts signals from
`peer=unconfined`, so the kernel denies the kill.

Verify:

```bash
docker run -d --name aa-test alpine sleep 60
docker stop aa-test   # "permission denied" => you are affected
```

Fix (requires root):

```bash
sudo ln -s /etc/apparmor.d/runc /etc/apparmor.d/disable/runc
sudo apparmor_parser -R /etc/apparmor.d/runc
```

> [!TIP]
> If you cannot get root, you can stop a container from the inside instead:
> `docker exec <container> kill -TERM 1 && docker rm <container>`

### 1.2 Docker network

Every module attaches to an external network named `sepal`:

```bash
docker network create --subnet 172.20.0.0/16 sepal
```

> [!NOTE]
> The subnet is not arbitrary. The `logger` container takes the static IP `172.20.128.2`, and every
> other service sends its logs to `udp://172.20.128.2` via the syslog driver. Using a different
> subnet will make every container fail to start.

### 1.3 Data directories

```bash
mkdir -p ~/sepal-data ~/sepal-backup
```

---

## Step 2 — Configuration file

The `sepal` CLI reads its configuration from `~/.sepal/env`. It is **not** part of the repository
and you must create it yourself.

```bash
mkdir -p ~/.sepal
touch ~/.sepal/env
chmod 600 ~/.sepal/env
```

Generate the secrets first — do not reuse the examples:

```bash
for v in MYSQL_ROOT_PASSWORD MYSQL_PASSWORD LDAP_ADMIN_PASSWORD \
         SEPAL_ADMIN_PASSWORD SEPAL_ADMIN_WEB_PASSWORD; do
    echo "$v=$(openssl rand -hex 12)"
done
```

Then write `~/.sepal/env`, substituting your own paths and the secrets generated above:

```bash
DEPLOY_ENVIRONMENT=DEV
SEPAL_VERSION=latest
DOCKER_REGISTRY_HOST=localhost
DOCKER_REGISTRY_USERNAME=
DOCKER_REGISTRY_PASSWORD=
BUILD_NUMBER=0
GIT_COMMIT=dev
HOSTING_SERVICE=local

SEPAL_HOST=localhost
SEPAL_ENDPOINT=https://localhost
SEPAL_IP=127.0.0.1
SEPAL_HTTP_PORT=80
SEPAL_HTTPS_PORT=443
SEPAL_APPS_HOST=
SEPAL_APPS_CATALOG_URL=
SEPAL_SSH_IP=127.0.0.1
SEPAL_SSH_PORT_1=2022
SEPAL_SSH_PORT_2=2023

SELF_SIGNED_TLS_CERTIFICATE=true
LETSENCRYPT_EMAIL=dev@example.org

SEPAL_PROJECT_DIR=/absolute/path/to/your/sepal/checkout
SEPAL_DATA_DIR=/absolute/path/to/sepal-data
SEPAL_BACKUP_DIR=/absolute/path/to/sepal-backup

MYSQL_ROOT_PASSWORD=<generated>
MYSQL_PASSWORD=<generated>
LDAP_ADMIN_PASSWORD=<generated>
SEPAL_ADMIN_PASSWORD=<generated>
SEPAL_ADMIN_WEB_PASSWORD=<generated>

# Google integrations - intentionally empty for a local instance
GOOGLE_PROJECT_ID=
GOOGLE_REGION=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_BASE_URL=
GOOGLE_ANALYTICS_ID=
GOOGLE_MAPS_API_KEY=
GOOGLE_RECAPTCHA_ENTERPRISE_API_KEY=
GOOGLE_RECAPTCHA_ENTERPRISE_SITE_KEY=
GOOGLE_RECAPTCHA_ENTERPRISE_MIN_SCORE=0.7
EE_ACCOUNT=
EE_PRIVATE_KEY=

NICFI_PLANET_API_KEY=
CEO_URL=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BACKUP_BUCKET=
RESTORE_BACKUP=false

SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=noreply@localhost
SMTP_FROM_DOMAIN=localhost

PUSHOVER_API_KEY=
PUSHOVER_GROUP_KEY=
PUSHOVER_EMERGENCY_RETRY_DELAY_SECONDS=60
PUSHOVER_EMERGENCY_RETRY_TIMEOUT_SECONDS=3600

OPS_DOMAIN=
JENKINS_PORT=8080
JENKINS_PASSWORD=
```

> [!NOTE]
> Leaving the `GOOGLE_*` and `EE_*` variables empty is deliberate and supported. reCAPTCHA is
> bypassed in dev mode because `modules/user-node/docker-compose.override.yml` sets
> `RECAPTCHA_OPTIONAL=true`. Google Earth Engine features will simply be unavailable.

> [!WARNING]
> `SELF_SIGNED_TLS_CERTIFICATE=true` is required for a local instance — Caddy would otherwise try
> to obtain a real Let's Encrypt certificate for `localhost` and fail. HTTPS itself is **not**
> optional: the gateway issues its session cookie with `secure: true`, so login over plain HTTP
> cannot work.

---

## Step 3 — Development environment container

All subsequent commands run inside the `sepal-dev` container, which owns the `sepal` CLI.

```bash
bin/dev-env start
```

This builds and starts `sepal-dev`, mounting the repository at `/home/sepal/sepal` and `~/.sepal`
at `/etc/sepal/config`.

### 3.1 Install the CLI dependencies

> [!IMPORTANT]
> The bind mount of the repository **shadows** the `npm install` performed in the dev-env
> `Dockerfile`, so the CLI starts with no dependencies and fails with
> `ERR_MODULE_NOT_FOUND: commander`. You must install them once, into the mounted tree:

```bash
docker exec sepal-dev bash -lc 'cd /home/sepal/sepal/dev-env && npm install'
```

This writes `dev-env/node_modules`, which is gitignored.

Verify the CLI works:

```bash
docker exec sepal-dev bash -lc 'sepal status'
```

---

## Step 4 — Build and start the core infrastructure

```bash
docker exec sepal-dev bash -lc 'sepal build logger mysql rabbitmq'
docker exec sepal-dev bash -lc 'sepal start logger mysql rabbitmq'
```

> [!NOTE]
> `logger` must be healthy before anything else. Every other compose file `extends`
> `modules/docker-compose.logger.yml` and points its syslog driver at the logger's static IP.
> `sepal start` handles this ordering for you.

Then the authentication and gateway modules:

```bash
docker exec sepal-dev bash -lc 'sepal build user-node gateway'
docker exec sepal-dev bash -lc 'sepal npm-install user-node gateway'
docker exec sepal-dev bash -lc 'sepal start gateway'
```

Do **not** start `user-node` yet — it will not come up until the next step is done.

---

## Step 5 — Bootstrap the `sepal_user` schema

> [!CAUTION]
> **This step works around a bug.** On a fresh install nothing creates the `sepal_user` database.
> `user-node` waits five minutes for `sepal_user.sepal_user`, then exits fatally with
> `Timed out waiting for sepal_user.sepal_user`.

The repository is mid-way through replacing the Java `user` module with `user-node`. The Java
module's Flyway migrations were disabled in commit `7889fbdd9` *("Disabled migrations on former
user module.")*, but `user-node` still waits for that module to create the base table. The
migration path assumed an existing production database; there is no bootstrap for a new install.

Apply the Java module's own Flyway SQL files manually, in version order:

```bash
cd modules/user/src/main/resources/sql/sepal_user
PW=$(grep '^MYSQL_ROOT_PASSWORD=' ~/.sepal/env | cut -d= -f2)
for f in $(ls *.sql | sed 's/^V\([0-9]*\).*/\1 &/' | sort -n -k1,1 | cut -d' ' -f2); do
    docker exec -i mysql mysql -uroot -p"$PW" -D sepal_user < "$f" || \
    docker exec -i mysql mysql -uroot -p"$PW" < "$f"
done
```

> [!NOTE]
> `V1_0__schema_base.sql` creates the schema itself, so the first iteration runs without a default
> database selected. `V13_0__username_case.sql` conversely uses an unqualified table name and
> *requires* one. The fallback above handles both.

Verify:

```bash
docker exec mysql mysql -uroot -p"$PW" -N -e "SHOW TABLES IN sepal_user;"
# expected: rmb_message, rmb_message_processing, sepal_user
```

Now start `user-node`:

```bash
docker exec sepal-dev bash -lc 'sepal start user-node'
docker logs user-node 2>&1 | grep -E 'migrations|Bootstrap'
```

You should see Postgrator take over and the admin accounts being seeded:

```
[INFO] database - Applied migrations to database sepal_user, updated from version 0 to 1
[INFO] bootstrap - Bootstrap: established credentials and home for 'sepaladmin'
[INFO] bootstrap - Bootstrap: established credentials and home for 'admin'
```

> [!TIP]
> The web login for `admin` is `SEPAL_ADMIN_WEB_PASSWORD`; `sepaladmin` uses
> `SEPAL_ADMIN_PASSWORD`. Both come from `~/.sepal/env`.

---

## Step 6 — Remaining application modules

```bash
MODULES="app-launcher ceo-gateway email scene-metadata ssh-gateway sys-monitor terminal user-assets user-files user-storage"
docker exec sepal-dev bash -lc "sepal build $MODULES"
docker exec sepal-dev bash -lc "sepal npm-install $MODULES"
docker exec sepal-dev bash -lc "sepal start $MODULES"
```

> [!IMPORTANT]
> `sepal npm-install` is not optional. The dev-mode compose overrides bind-mount the host's
> `node_modules` directories over the ones baked into the image, so a freshly built module starts
> with **no dependencies** unless you run it.

---

## Step 7 — Web UI and HTTPS entry point

```bash
docker exec sepal-dev bash -lc 'sepal start -p gui'
docker exec sepal-dev bash -lc 'sepal start caddy'
```

> [!WARNING]
> The `-p` flag (production mode) is **required unless your host UID is 1000**.
> `modules/gui/docker-compose.override.yml` hardcodes `user: "1000:1000"` alongside bind mounts of
> the source tree; with any other UID the container cannot write to the mounted files and Vite
> fails. Production mode uses only `docker-compose.yml`, serving the pre-built `dist` through
> nginx, and has no such constraint.
>
> The trade-off is that you lose hot reload. If you need it, see
> [Host UID is not 1000](#host-uid-is-not-1000).

---

## Step 8 — Verify

```bash
curl -sk -o /dev/null -w "GET / -> %{http_code}\n" https://localhost/
curl -sk -w "\nlogin -> %{http_code}\n" -X POST \
     -u "admin:$(grep '^SEPAL_ADMIN_WEB_PASSWORD=' ~/.sepal/env | cut -d= -f2)" \
     https://localhost/api/user/login
```

Both should return `200`, and the login call should return a JSON user object with
`"roles":["application_admin"]`.

Open <https://localhost> and accept the certificate warning — Caddy signs it with its own internal
CA, so the browser cannot validate it.

---

## Known blockers

### `geospatial-toolkit` fails to build

```
E: Package 'google-cloud-sdk' has no installation candidate
```

Google renamed the APT package from `google-cloud-sdk` to `google-cloud-cli`, and the transitional
package was dropped. `modules/geospatial-toolkit/script/init_gcloud.sh` still installs the old
name. The one-line fix is to install `google-cloud-cli` instead.

This blocks the whole downstream chain:

```
geospatial-toolkit -> sandbox -> sepal-server -> gee
```

> [!NOTE]
> Whether that single fix is *sufficient* to complete the build has not been verified — the later
> steps (`init_drive.sh`, `init_python_packages.sh`, `init_r_packages.sh`, `init_azure_cli.sh`) may
> contain comparable staleness.

If you want to work around it without touching the repository, build the image from an external
context containing only a patched copy of that one module — the `Dockerfile` reads nothing outside
`modules/geospatial-toolkit/`, so roughly 20 files are enough.

### `user` and `ldap` are legacy

Neither appears in the `:default` module group; `user-node` replaces both. The Java `user` module
still starts and reports *healthy* even when its database is unreachable — its healthcheck does not
cover the connection pool — so do not rely on its status.

---

## Troubleshooting

### Host UID is not 1000

`sepal build <node-module>` fails with:

```
chown: changing ownership of '...': Operation not permitted
```

`ensurePackageLockExists()` in `dev-env/src/build.js` runs a hardcoded `chown -R 1000:1000` over
the module directory. On a host whose files are owned by any other UID, this cannot succeed.

Only `build` is affected — `sepal start`, `sepal npm-install` and `sepal logs` are fine.

Workaround: create the directories the build expects, then invoke the underlying command directly.

```bash
# once, per module
mkdir -p modules/<module>/node_modules
mkdir -p modules/<module>/lib/shared/node_modules   # and lib/ee where applicable

docker exec -e BUILD_NUMBER=latest -e GIT_COMMIT=$(git rev-parse HEAD) sepal-dev bash -lc \
  "cd /home/sepal/sepal/modules/<module> && docker compose --env-file=/etc/sepal/config/env build"
```

Add `--file=docker-compose.yml` to build the GUI's production image without the dev override.

> [!NOTE]
> These directories are gitignored, and every `package-lock.json` the build expects is already
> tracked, so this leaves the working tree clean.

### `sepal restart` / `sepal stop` fail with `permission denied`

See [1.1 AppArmor](#11-apparmor-ubuntu-2404-and-later).

### `user-node` is `UNHEALTHY` with `Unknown database 'sepal_user'`

The schema bootstrap in [Step 5](#step-5--bootstrap-the-sepal_user-schema) was not applied, or was
applied after `user-node` had already exhausted its five-minute wait. Re-run the SQL, then restart
the module.

### Checking overall state

```bash
docker exec sepal-dev bash -lc 'sepal status'
docker ps --format '{{.Names}} | {{.Status}}'
docker exec sepal-dev bash -lc 'sepal logs <module> -r'
```
