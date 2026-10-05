# Local deployment

How to bring a complete SEPAL stack up on a single Linux machine, for development or evaluation.

The result is the 22 modules of the `:default` group running as containers on the `sepal` Docker
network, reachable over HTTPS on `localhost`, with the GUI in Vite dev mode and the Node modules
under `nodemon` — so source edits apply live.

This is not a production deployment. Production provisioning lives in `ansible/` and
`hosting-services/`.

## 1. Prerequisites

| Requirement | Notes |
| --- | --- |
| Linux host | Tested on Ubuntu 24.04 |
| Docker Engine 24+ | **Exactly one daemon** — see below |
| Docker Compose v2 | Bundled with recent Docker Engine |
| Git | |
| 16 GB RAM | 8 GB is tight once the full stack runs |
| 60 GB free disk | ~30 GB of images, more if you build the sandbox images |
| Host user in the `docker` group | `sudo usermod -aG docker $USER`, then re-login |

### Only one Docker daemon

If Docker was installed both from the `docker` snap and from the `docker-ce` apt package, the two
daemons fight over `/var/run/docker.sock`. The symptom is subtle and misleading: `docker build`,
`docker compose up` and `docker exec` all work, but `docker stop`, `docker kill` and
`docker restart` fail with `permission denied` on every container — which in turn breaks
`sepal stop`, `sepal restart`, `sepal buildrestart` and `sepal npm-install` (the latter stops the
module first).

Check for it:

```bash
snap list docker 2>/dev/null
systemctl is-enabled docker.service docker.socket 2>/dev/null
```

If both report something, keep one. To keep the snap (preserves images already built under
`/var/snap/docker/common/var-lib-docker`):

```bash
sudo systemctl disable --now docker.service docker.socket
sudo snap restart docker
```

To keep the apt package instead, `sudo snap disable docker` — but the data roots differ, so every
image has to be rebuilt.

Verify before going further:

```bash
docker stop hello-test 2>/dev/null; docker run --name hello-test -d alpine sleep 60
docker stop hello-test && docker rm hello-test && echo "daemon OK"
```

## 2. Clone

```bash
git clone https://github.com/openforis/sepal.git
cd sepal
```

Everything below assumes this directory; export it for convenience:

```bash
export SEPAL_DIR=$PWD
```

## 3. Configuration

All configuration lives in a single env file **outside the repository**, at `~/.sepal/env`. The
`sepal` CLI mounts `~/.sepal` into the dev-env container at `/etc/sepal/config` and passes
`--env-file=/etc/sepal/config/env` to every `docker compose` invocation.

```bash
mkdir -p ~/.sepal
touch ~/.sepal/env
chmod 600 ~/.sepal/env
```

Generate the secrets locally — never copy them from a document:

```bash
gen() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-24; }

cat > ~/.sepal/env <<EOF
# ─── Deployment identity ──────────────────────────────────────────────────
DEPLOY_ENVIRONMENT=DEV
SEPAL_VERSION=latest
BUILD_NUMBER=local
GIT_COMMIT=$(git -C "$SEPAL_DIR" rev-parse --short HEAD)
DOCKER_REGISTRY_HOST=localhost
DOCKER_REGISTRY_USERNAME=
DOCKER_REGISTRY_PASSWORD=

# ─── Paths (host paths — compose talks to the host docker daemon) ─────────
SEPAL_PROJECT_DIR=$SEPAL_DIR
SEPAL_DATA_DIR=$SEPAL_DIR/sepal-data
SEPAL_BACKUP_DIR=$SEPAL_DIR/sepal-data/backup

# ─── Networking ───────────────────────────────────────────────────────────
SEPAL_HOST=localhost
SEPAL_APPS_HOST=localhost
SEPAL_ENDPOINT=https://localhost
SEPAL_IP=127.0.0.1
SEPAL_HTTP_PORT=80
SEPAL_HTTPS_PORT=443
SEPAL_SSH_IP=127.0.0.1
SEPAL_SSH_PORT_1=2222
SEPAL_SSH_PORT_2=2443
SELF_SIGNED_TLS_CERTIFICATE=true
LETSENCRYPT_EMAIL=admin@localhost

# ─── Hosting service ──────────────────────────────────────────────────────
HOSTING_SERVICE=local
SANDBOX_DEFAULT_INSTANCE_TYPE=

# ─── Secrets ──────────────────────────────────────────────────────────────
MYSQL_ROOT_PASSWORD=$(gen)
MYSQL_PASSWORD=$(gen)
SEPAL_ADMIN_PASSWORD=$(gen)
SEPAL_ADMIN_WEB_PASSWORD=$(gen)
SEPAL_API_KEY=$(gen)
SESSION_EXPIRY_SECRET=$(gen)

# ─── Sessions ─────────────────────────────────────────────────────────────
SESSION_EXPIRY_MODE=off

# ─── Google / Earth Engine (see section 11) ───────────────────────────────
GOOGLE_PROJECT_ID=
GOOGLE_REGION=us-central1
EE_ACCOUNT=
EE_PRIVATE_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_ANALYTICS_ID=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_BASE_URL=https://localhost
GOOGLE_RECAPTCHA_ENTERPRISE_API_KEY=
GOOGLE_RECAPTCHA_ENTERPRISE_SITE_KEY=
GOOGLE_RECAPTCHA_ENTERPRISE_MIN_SCORE=0.5

# ─── Third party (optional) ───────────────────────────────────────────────
CEO_URL=https://app.collect.earth
NICFI_PLANET_API_KEY=
CARTODB_BASEMAP_KEY=
SEPAL_APPS_CATALOG_URL=

# ─── SMTP (email module is inert without a server) ────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_DOMAIN=localhost

# ─── AWS (unused when HOSTING_SERVICE=local) ──────────────────────────────
AWS_REGION=
AWS_AVAILABILITY_ZONE=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BACKUP_BUCKET=
RESTORE_BACKUP=false

# ─── Ops (unused locally) ─────────────────────────────────────────────────
OPS_DOMAIN=
JENKINS_PORT=
JENKINS_PASSWORD=
SYSLOG_ADDRESS=udp://172.20.128.2
EOF

unset -f gen
chmod 600 ~/.sepal/env
```

Notes on the values that matter:

- `SEPAL_IP=127.0.0.1` binds every published port to loopback. Keep it unless you accept exposing
  the instance on your network.
- `SEPAL_HOST=localhost` is what Caddy's internal CA issues the certificate for, and what the GUI's
  Content-Security-Policy whitelists. Changing it means changing the URL you browse to.
- `SELF_SIGNED_TLS_CERTIFICATE=true` makes Caddy use its internal CA instead of ACME, which is
  mandatory for a name that has no public DNS record.
- `HOSTING_SERVICE=local` makes `worker` provision sandboxes as local Docker containers instead of
  EC2 instances, so the whole `AWS_*` block stays empty.

## 4. Docker network and data directories

Every module's compose file declares the `sepal` network as `external: true`, so it must exist
before anything starts:

```bash
docker network create --driver bridge --subnet 172.20.0.0/16 sepal
```

Create the bind-mount targets. Containers run as unprivileged users and will not create these for
you:

```bash
cd "$SEPAL_DIR"
mkdir -p sepal-data/{caddy/data,caddy/config,mysql/db,mysql-files,rabbitmq} \
         sepal-data/{gateway-redis,email-redis,scene-metadata-redis} \
         sepal-data/{user-assets-redis,user-storage-redis} \
         sepal-data/{sepal/home,user/home,app-launcher,app-manager,ssh-gateway,backup}
```

`sepal-data/` is gitignored.

## 5. The dev-env container

All tooling runs inside a container that carries Node, the Docker CLI and the `sepal` command, with
the host Docker socket bind-mounted.

```bash
cd "$SEPAL_DIR"
bin/dev-env start          # reads ~/.sepal; use -c <dir> for another config directory
```

The first run builds the image. Then open a shell in it — every command in sections 6 to 9 runs
**inside** this container:

```bash
docker exec -it sepal-dev bash
```

Inside, the repository is at `/home/sepal/sepal` and the config at `/etc/sepal/config/env`.

## 6. Host UID mismatch

The containers run their Node processes as `uid=1000`, and the dev overrides bind-mount your host
`node_modules` straight into them. If your host account is not uid 1000 — typical on machines joined
to Active Directory or LDAP, where uids look like `584830346` — two things break:

1. `sepal build` runs `chown -R 1000:1000` on the module directory and aborts with
   `Operation not permitted`, because changing an owner requires `CAP_CHOWN`.
2. Even once built, containers cannot read the bind-mounted `node_modules`, and every module dies
   with `ERR_MODULE_NOT_FOUND: Cannot find package 'sepal'`.

Check first:

```bash
id -u        # 1000 → skip this section entirely
```

If it is not 1000, grant uid 1000 access with POSIX ACLs rather than changing ownership. ACLs are
file metadata, invisible to Git, and reversible:

```bash
cd "$SEPAL_DIR"
setfacl -R -m  u:1000:rwX lib modules      # existing files
setfacl -R -d -m u:1000:rwX lib modules    # default, for files created later
```

This requires a filesystem mounted with ACL support (the default for ext4 and xfs). To undo:
`setfacl -R -b lib modules`.

Because `sepal build` and `sepal npm-install` remain unusable in this situation, sections 7 and 8
give a direct `docker compose` equivalent.

## 7. Install npm dependencies

The shared library is consumed through Node import maps (`#sepal/*`) resolved via a `node_modules/sepal`
symlink, so it must be installed with `--install-links=false`.

Standard path:

```bash
sepal npm-install :default
```

If that fails because of the UID mismatch, install directly:

```bash
cd /home/sepal/sepal/lib/js/shared && npm install --install-links=false

for m in app-launcher app-manager budget ceo-gateway email gateway gee gui message \
         recipe scene-metadata storage task terminal user user-assets user-files worker; do
  echo "── $m"
  (cd /home/sepal/sepal/modules/$m && npm install --install-links=false)
done
```

## 8. Build the images

Standard path:

```bash
sepal build :default -r
```

Direct equivalent, which is what to use when `sepal build` trips on the `chown`:

```bash
cd /home/sepal/sepal
for m in logger mysql rabbitmq message user budget email recipe scene-metadata gee \
         user-assets user-files ceo-gateway storage terminal ssh-gateway worker \
         app-launcher gateway gui caddy; do
  echo "── building $m"
  (cd modules/$m && docker compose --env-file=/etc/sepal/config/env build) || break
done
```

`app-manager` builds `FROM openforis/sandbox-base`, which is not published on Docker Hub, so build
that base image first. It is large (~4.3 GB) and takes a while:

```bash
(cd modules/sandbox-base && docker compose --env-file=/etc/sepal/config/env build)
(cd modules/app-manager  && docker compose --env-file=/etc/sepal/config/env build)
```

`sandbox` and `geospatial-toolkit` are not in the `:default` group and are not needed to bring the
platform up. Build them only if you want working sandbox sessions — see section 12.

## 9. Start the stack

Standard path:

```bash
sepal start :default
```

Direct equivalent, in dependency order:

```bash
cd /home/sepal/sepal
for m in logger mysql rabbitmq message user budget email recipe scene-metadata gee \
         user-assets user-files ceo-gateway storage terminal ssh-gateway \
         app-launcher app-manager worker gateway gui caddy; do
  echo "── starting $m"
  (cd modules/$m && docker compose --env-file=/etc/sepal/config/env up -d)
done
```

MySQL runs its Postgrator migrations on first start, so give it a moment before checking:

```bash
sepal status
docker ps --format '{{.Names}}\t{{.Status}}' | sort
```

Expect roughly 29 containers, all `(healthy)`.

## 10. Create the first admin

A fresh database has no users at all. On every start the `user` module runs a bootstrap that fills in
the password, home directory and SSH key for `sepaladmin` and `admin` from `SEPAL_ADMIN_PASSWORD`
and `SEPAL_ADMIN_WEB_PASSWORD` — but only for rows that already exist. On a fresh install it logs:

```
Bootstrap: 'admin' is not seeded; skipping
```

So insert the row, then let the bootstrap credential it. From inside `sepal-dev`:

```bash
docker exec -i mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" user' <<'SQL'
INSERT INTO sepal_user (username, name, email, organization, admin, system_user, status)
VALUES ('admin', 'Admin', 'admin@sepal.local', 'local', 1, 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE admin = 1;
SQL

cd /home/sepal/sepal/modules/user
docker compose --env-file=/etc/sepal/config/env restart user
```

The bootstrap now assigns the POSIX uid/gid, provisions the home directory, generates the SSH key
and hashes `SEPAL_ADMIN_WEB_PASSWORD` with scrypt. Confirm:

```bash
docker logs user 2>&1 | grep -i bootstrap
```

`admin = 1` is what grants the `application_admin` role; the bootstrap never sets it, because on
legacy installs it came from the old Flyway seed.

Further users are created through the GUI's signup/invite flow, or by the same `INSERT` with
`admin = 0` and `status = 'PENDING'` followed by a password reset.

> Passwords set through the API are validated against `PASSWORD_MIN_LENGTH = 12`
> ([validation.js](../modules/user/src/validation.js#L16)). Rows inserted directly bypass that
> check, which is acceptable for a loopback-only instance and never otherwise.

## 11. Reach the platform

Published ports, all bound to `127.0.0.1`:

| Service | Port | URL |
| --- | --- | --- |
| SEPAL GUI | 443 | `https://localhost` |
| HTTP redirect | 80 | |
| phpMyAdmin | 8980 | `http://127.0.0.1:8980` |
| RabbitMQ management | 15672 | `http://127.0.0.1:15672` |
| SSH gateway | 2222, 2443 | |
| Docker API proxy | 2375 | |

Log in as `admin` with `SEPAL_ADMIN_WEB_PASSWORD`. The certificate is signed by Caddy's internal CA,
so accept the browser warning once.

Smoke test:

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/
curl -sk -u admin:"$SEPAL_ADMIN_WEB_PASSWORD" -X POST https://localhost/api/user/login | jq .roles
```

The second call should return `["application_admin"]`.

### Working on a remote host

If the stack runs on a remote machine and your browser is elsewhere, forward the ports rather than
rebinding them:

```bash
ssh -L 443:127.0.0.1:443 -L 8980:127.0.0.1:8980 -L 15672:127.0.0.1:15672 user@remote
```

Under VS Code Remote-SSH, the **PORTS** panel does the same over the existing connection.

Forward to **local port 443**, not an arbitrary one. The GUI's CSP whitelists `wss://localhost`,
and a CSP host source without a port matches only the scheme's default port — so on `localhost:8443`
the Vite HMR websocket is silently blocked.

## 12. Optional extras

### Earth Engine credentials

Without them the `gee` module starts but every Earth Engine call fails. Fill three variables in
`~/.sepal/env` from a Google service-account JSON. `EE_PRIVATE_KEY` must be a **single unquoted
line** with literal `\n` escapes, which [gee/src/config.js](../modules/gee/src/config.js#L77)
converts back:

```bash
python3 - /path/to/service-account.json <<'PY'
import json, pathlib, sys
sa = json.load(open(sys.argv[1]))
env = pathlib.Path.home() / '.sepal' / 'env'
vals = {
    'GOOGLE_PROJECT_ID': sa['project_id'],
    'EE_ACCOUNT': sa['client_email'],
    'EE_PRIVATE_KEY': sa['private_key'].replace('\n', '\\n'),
}
lines = env.read_text().splitlines()
for i, line in enumerate(lines):
    k = line.split('=', 1)[0]
    if k in vals:
        lines[i] = f'{k}={vals.pop(k)}'
lines += [f'{k}={v}' for k, v in vals.items()]
env.write_text('\n'.join(lines) + '\n')
PY
```

Environment variables are injected at container creation, so recreate the consumers:

```bash
for m in gee worker app-launcher; do
  (cd /home/sepal/sepal/modules/$m && \
   docker compose --env-file=/etc/sepal/config/env up -d --force-recreate)
done
```

On the Google side the project needs the Earth Engine API enabled, and the service account must be
registered with Earth Engine and hold a role such as `Earth Engine Resource Writer`.

### Sandbox images

The web terminal and user sandbox sessions need two more images, both derived from `sandbox-base`.
`geospatial-toolkit` needs `r-proxy` running at build time:

```bash
(cd /home/sepal/sepal/modules/r-proxy && docker compose --env-file=/etc/sepal/config/env up -d)
for m in geospatial-toolkit sandbox; do
  (cd /home/sepal/sepal/modules/$m && docker compose --env-file=/etc/sepal/config/env build)
done
```

Budget on the order of an hour and several tens of gigabytes.

## 13. Development workflow

The dev overrides bind-mount your working tree into the containers, so the stack reloads itself:

- **GUI** runs the Vite dev server (`npm start`) from the `build` stage of its Dockerfile, not the
  nginx runtime stage. Editing anything under `modules/gui/src` or `lib/js/shared/src` triggers HMR;
  the websocket travels through Caddy's reverse proxy.
- **Node modules** run under `nodemon`, watching `src/`, `config/` and `lib/js/shared/`. A save
  restarts the process in place.

Adding an npm dependency is not live: run `npm install` and recreate the container.

Useful commands, from inside `sepal-dev`:

```bash
sepal status -d              # statuses with dependencies
sepal logs <module> -r       # recent logs, following
sepal shell <module>         # shell into a module container
sepal npm-test <module>      # tests
sepal eslint <module> -f     # lint with autofix
sepal buildrestart <module>  # rebuild and restart
```

Always run tests through `sepal npm-test`; a raw `npx jest` in the dev-env fails every suite that
imports `#sepal/ee/ee` with a post-teardown import error that looks exactly like a real failure.

## 14. Tear down

```bash
cd /home/sepal/sepal
for m in caddy gui gateway worker app-manager app-launcher ssh-gateway terminal storage \
         ceo-gateway user-files user-assets gee scene-metadata recipe email budget user \
         message rabbitmq mysql logger; do
  (cd modules/$m && docker compose --env-file=/etc/sepal/config/env down)
done
```

State survives in `sepal-data/`. Delete that directory for a genuinely clean slate — it takes the
database, home directories and Caddy's CA with it.

## 15. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `docker stop` → `permission denied` on every container | Two Docker daemons | Section 1 |
| `sepal build` → `chown: Operation not permitted` | Host uid ≠ 1000 | Section 6 |
| `ERR_MODULE_NOT_FOUND: Cannot find package 'sepal'` | Container cannot read bind-mounted `node_modules` | Section 6 |
| `pull access denied for openforis/sandbox-base` | Base image is not published | Build it locally, section 8 |
| Browser cannot reach `https://localhost` | Ports bound to loopback on a remote host | Forward them, section 11 |
| HMR never fires in the browser | Forwarded to a non-443 local port, CSP blocks the websocket | Forward to 443 |
| `curl https://127.0.0.1/` fails, `https://localhost/` works | Caddy's certificate covers the name, not the IP | Use the name |
| Module restarts in a loop at first start | MySQL still migrating | Wait, then `sepal status` |
