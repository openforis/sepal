# user

Node.js user module (formerly `user-node`; it replaced the now-deleted Java `user`
module and LDAP). Owns users and their credentials (password hashes, SSH public keys)
in the `user` MySQL database (table `sepal_user`), copied by migration 001 from the legacy
`sepal_user` schema, which is left untouched. The one-shot LDAP→DB credential migration that ran
at startup during the transition has been removed along with the `ldap` module.

POSIX identity is **stored**, not derived: `sepal_user` has `uid` and `gid` columns.
For users migrated from LDAP they hold the real `uidNumber` and per-user-group
`gidNumber` (each was allocated from an independent ldapscripts sequence, so they differ
from each other and from `sepal_user.id`; on-disk files are owned by these numbers).
Users created by this module get `uid = gid = id`, which is collision-free because the
LDAP migration bumped the table `AUTO_INCREMENT` past every existing uid/gid. There is
no shared group model — the only file-owning shared group, `sepal` (gid 9999), is a
local OS group.

> Note: this reverses design decision **D8** (which assumed `uid = gid = id`).
> Production data showed `id ≠ uidNumber` for many users, so uid/gid are now stored.

See the design spec: `docs/superpowers/specs/2026-06-16-ldap-removal-user-node-design.md`
(the module was named `user-node` there) and the rename/decommission design:
`docs/superpowers/specs/2026-07-07-user-module-rename-decommission-design.md`.

## Schema ownership

The module owns the `user` schema end to end: migration 001 creates the `sepal_user`
table at its full current shape and copies the rows from the legacy `sepal_user` schema
if that schema is present and the target is still empty. Postgrator uses the default
history table `schema_version`. The Java `user` module's previous Flyway
history table was renamed to `schema_version_old` at cutover.
