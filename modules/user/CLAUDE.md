# User

Owns accounts, password hashes, SSH public keys, Google credentials and POSIX identities in the `user`
Postgres database (`sepal_user` and `ssh_key` tables). The Java user service and LDAP are no longer runtime dependencies.

## POSIX identity

`uid` and `gid` are stored independently of the account ID. Migrated users retain their LDAP-assigned
values, which can differ from each other and from `id`; existing files depend on those values.
New users get `uid = gid = id`. The LDAP migration advanced the identity sequence beyond existing uid/gid values
before this allocation rule was used. The local OS group `sepal` (gid 9999) is separate from per-user groups.

## Login throttling

`/authenticate` (gateway) and `/auth/password` (ssh-gateway) share one in-memory `LoginThrottle`. Per 15 minutes
it allows `MAX_USERNAME_FAILURES` failed logins of a username from one `clientIp` (the address the caller sends), and
`MAX_CLIENT_FAILURES` from one `clientIp` whatever the username. A limit that is unset, `false` or below 1 is
disabled, so logins are unlimited by default. Never per username alone, which would let anyone lock a user out. A
throttled login is answered 429 before its password is verified, even when the password is right. Counts reset when
the module restarts.

## Database migrations

`migrations/001.do.schema.sql` creates the complete Postgres schema. `migrations/mysql-import.sql` copies the
rows, including uid/gid and credentials, from the legacy MySQL `user` database (kept in `migrations-mysql/`) on
first start, then advances both identity sequences; a restart that finds MySQL changed since the import is refused.
Usernames and emails are `citext`, so comparisons and unique indexes ignore case. `system_user` is a reserved
word in Postgres and must be quoted in SQL.
See [database migrations](../../docs/database-migrations.md) for startup and repair.
