# User

Owns accounts, password hashes, SSH public keys, Google credentials and POSIX identities in the `user`
MySQL database (`sepal_user` table). The Java user service and LDAP are no longer runtime dependencies.

## POSIX identity

`uid` and `gid` are stored independently of the account ID. Migrated users retain their LDAP-assigned
values, which can differ from each other and from `id`; existing files depend on those values.
New users get `uid = gid = id`. The LDAP migration advanced `AUTO_INCREMENT` beyond existing uid/gid values
before this allocation rule was used. The local OS group `sepal` (gid 9999) is separate from per-user groups.
Identity repair fills each missing field from `id` independently and preserves every populated UID/GID.

## Home mount

Deployed `/sepal/home` uses the host's separate `nosymfollow` bind view. Startup verifies its effective
mount options in `/proc/self/mountinfo` before database initialization or provisioning, and exits if
protection is absent or cannot be verified. Only explicit `DEPLOY_ENVIRONMENT=DEV` skips that check and
retains the normal mount. Managed directory paths must be real directories;
credential deletion refuses symlinks instead of reporting success.

## Login throttling

`/authenticate` (gateway) and `/auth/password` (ssh-gateway) share one in-memory `LoginThrottle`. Per 15 minutes
it allows `MAX_USERNAME_FAILURES` failed logins of a username from one `clientIp` (the address the caller sends), and
`MAX_CLIENT_FAILURES` from one `clientIp` whatever the username. A limit that is unset, `false` or below 1 is
disabled, so logins are unlimited by default. Never per username alone, which would let anyone lock a user out. A
throttled login is answered 429 before its password is verified, even when the password is right. Counts reset when
the module restarts.

## Reset links

Token lookup and password reset both require a byte-exact token, including case and trailing spaces,
regardless of the database collation. Validation must not accept a token that the reset would reject.

## Database migrations

`migrations/001.do.schema.sql` creates the complete current table. The separate
`migrations/legacy-import/001.do.import.sql` copies rows, including uid/gid and credentials, from the
legacy `sepal_user` schema only when its table exists and the target is empty. The source is unchanged.
Schema and import histories use `schema_version` and `legacy_import_version` respectively.
See [database migrations](../../docs/database-migrations.md) for startup, repair and import retirement.

## User-list subscriptions

The WebSocket protocol retains the latest administrator flag and revision per user for the gateway
connection. Local `userChanged$` publications and newer subscription snapshots update that authority;
a demotion removes all of the user's subscriptions before another profile is forwarded. Older or
unversioned snapshots cannot override a known newer role. Tab closure preserves this knowledge;
connection teardown clears it. Promotion permits a fresh subscription without resurrecting removed ones.
