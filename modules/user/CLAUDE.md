# User

Owns accounts, password hashes, SSH public keys, Google credentials and POSIX identities in the `user`
MySQL database (`sepal_user` table). The Java user service and LDAP are no longer runtime dependencies.

## POSIX identity

`uid` and `gid` are stored independently of the account ID. Migrated users retain their LDAP-assigned
values, which can differ from each other and from `id`; existing files depend on those values.
New users get `uid = gid = id`. The LDAP migration advanced `AUTO_INCREMENT` beyond existing uid/gid values
before this allocation rule was used. The local OS group `sepal` (gid 9999) is separate from per-user groups.

## Database migrations

`migrations/001.do.schema.sql` creates the complete current table. The separate
`migrations/legacy-import/001.do.import.sql` copies rows, including uid/gid and credentials, from the
legacy `sepal_user` schema only when its table exists and the target is empty. The source is unchanged.
Schema and import histories use `schema_version` and `legacy_import_version` respectively.
See [database migrations](../../docs/database-migrations.md) for startup, repair and import retirement.
