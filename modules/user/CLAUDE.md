# User

Owns accounts, password hashes, SSH public keys, Google credentials and POSIX identities in the `user`
MySQL database (`sepal_user` table). The Java user service and LDAP are no longer runtime dependencies.

## POSIX identity

`uid` and `gid` are stored independently of the account ID. Migrated users retain their LDAP-assigned
values, which can differ from each other and from `id`; existing files depend on those values.
New users get `uid = gid = id`. The LDAP migration advanced `AUTO_INCREMENT` beyond existing uid/gid values
before this allocation rule was used. The local OS group `sepal` (gid 9999) is separate from per-user groups.

## Login throttling

`/authenticate` (gateway) and `/auth/password` (ssh-gateway) share one in-memory `LoginThrottle`. Per 15 minutes
it allows `MAX_USERNAME_FAILURES` failed logins of a username from one `clientIp` (the address the caller sends), and
`MAX_CLIENT_FAILURES` from one `clientIp` whatever the username. A limit that is unset, `false` or below 1 is
disabled, so logins are unlimited by default. Never per username alone, which would let anyone lock a user out. A
throttled login is answered 429 before its password is verified, even when the password is right. Counts reset when
the module restarts.

## Database migrations

`migrations/001.do.schema.sql` creates the complete current table. The separate
`migrations/legacy-import/001.do.import.sql` copies rows, including uid/gid and credentials, from the
legacy `sepal_user` schema only when its table exists and the target is empty. The source is unchanged.
Schema and import histories use `schema_version` and `legacy_import_version` respectively.
See [database migrations](../../docs/database-migrations.md) for startup, repair and import retirement.
