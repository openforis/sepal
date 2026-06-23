# user-node

Node.js replacement for the Java `user` module. Owns users and their credentials
(password hashes, SSH public keys) in the `sepal_user` MySQL database. Replaces LDAP.

POSIX identity is **stored**, not derived: `sepal_user` has `uid` and `gid` columns.
For users migrated from LDAP they hold the real `uidNumber` and per-user-group
`gidNumber` (each allocated from an independent ldapscripts sequence, so they differ
from each other and from `sepal_user.id`; on-disk files are owned by these numbers).
Users created by user-node get `uid = gid = id`, which is collision-free because the
LDAP migration bumps the table `AUTO_INCREMENT` past every existing uid/gid. There is
no shared group model — the only file-owning shared group, `sepal` (gid 9999), is a
local OS group.

> Note: this reverses design decision **D8** (which assumed `uid = gid = id`).
> Production data showed `id ≠ uidNumber` for many users, so uid/gid are now stored.

See the design spec: `docs/superpowers/specs/2026-06-16-ldap-removal-user-node-design.md`.

## Schema ownership

`user-node` migrates `sepal_user` via Postgrator using the history table
`schema_version_user_node`, coexisting with the Java `user` module's Flyway
(`schema_version`) during the transition. It waits for the base `sepal_user` table
to exist before migrating.
