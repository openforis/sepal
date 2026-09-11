import {getLogger} from '#sepal/log'

const log = getLogger('bootstrap')

// The admin users seeded by Flyway V1_0 (stored lowercased), each mapped to the plaintext-secret
// env var the sibling modules template into /etc/*.passwd.
export const SYSTEM_USERS = [
    {username: 'sepaladmin', secretEnv: 'SEPAL_ADMIN_PASSWORD'},
    {username: 'admin', secretEnv: 'SEPAL_ADMIN_WEB_PASSWORD'}
]

// Idempotent, and runs on every start: a fully-credentialed user is a no-op, as is a missing secret
// or an unseeded row.
export const createBootstrap = ({repository, provision, hashPassword, readSecret}) => {
    const ensureCredentials = async ({username, secretEnv}) => {
        const user = await repository.findByUsername(username)
        if (!user) {
            log.warn(`Bootstrap: '${username}' is not seeded; skipping`)
            return
        }
        if (user.passwordHash) {
            log.info(`Bootstrap: '${username}' already has credentials; skipping`)
            return
        }
        const secret = readSecret(secretEnv)
        if (!secret) {
            log.warn(`Bootstrap: ${secretEnv} is unset; cannot establish credentials for '${username}'`)
            return
        }
        // Fresh-install admins have no LDAP identity to migrate, so derive uid = gid = id. (On an
        // existing install the migration has already set real uid/gid + password, so bootstrap skips
        // these users above.) assignDerivedPosixIds only fills NULLs, so it never clobbers a migrated
        // identity.
        await repository.assignDerivedPosixIds(user.id)
        const uid = user.uid ?? user.id
        const gid = user.gid ?? user.id
        // Write password_hash LAST: it is the idempotency sentinel, so any failure in provision or
        // the key write leaves it NULL and the whole step self-heals on the next start (provision is
        // idempotent and re-writing the same key is harmless).
        const sshPublicKey = await provision(username, uid, gid)
        await repository.updateSshPublicKey(username, sshPublicKey)
        await repository.updatePassword(username, hashPassword(secret))
        log.info(`Bootstrap: established credentials and home for '${username}'`)
    }
    return async () => {
        for (const systemUser of SYSTEM_USERS) {
            try {
                await ensureCredentials(systemUser)
            } catch (error) {
                log.error(`Bootstrap failed for '${systemUser.username}'`, error)
            }
        }
    }
}
