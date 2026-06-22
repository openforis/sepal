# user-node

Node.js replacement for the Java `user` module. Owns users and their credentials
(password hashes, SSH public keys) in the `sepal_user` MySQL database. Replaces LDAP.

POSIX identity is derived, not stored: a user's `uid` and `gid` both equal
`sepal_user.id` (the auto-increment PK, which starts at 10000). There is no separate
group model — the only file-owning shared group, `sepal` (gid 9999), is a local OS
group.

See the design spec: `docs/superpowers/specs/2026-06-16-ldap-removal-user-node-design.md`.

## Schema ownership

`user-node` migrates `sepal_user` via Postgrator using the history table
`schema_version_user_node`, coexisting with the Java `user` module's Flyway
(`schema_version`) during the transition. It waits for the base `sepal_user` table
to exist before migrating.
