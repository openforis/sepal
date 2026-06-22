import {getLogger} from '#sepal/log'

import {hashPassword as defaultHashPassword} from './crypto.js'
import {provision as defaultProvision} from './provisioning.js'
import * as repository from './userRepository.js'

const log = getLogger('bootstrap')

// The admin users seeded by Flyway V1_0 (stored lowercased), each mapped to the plaintext-secret
// env var the sibling modules template into /etc/*.passwd.
const SYSTEM_USERS = [
    {username: 'sepaladmin', secretEnv: 'SEPAL_ADMIN_PASSWORD'},
    {username: 'admin', secretEnv: 'SEPAL_ADMIN_WEB_PASSWORD'}
]

// Establish credentials (password_hash) + filesystem (home/keys -> ssh_public_key) for one seeded
// admin user, ONLY when password_hash is missing. Idempotent: a fully-credentialed user is a no-op,
// as is a missing secret or an unseeded row.
const createBootstrap = ({findByUsername, updatePassword, updateSshPublicKey, provision, hashPassword, readSecret}) => {
    const ensureCredentials = async ({username, secretEnv}) => {
        const user = await findByUsername(username)
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
        // Write password_hash LAST: it is the idempotency sentinel, so any failure in provision or
        // the key write leaves it NULL and the whole step self-heals on the next start (provision is
        // idempotent and re-writing the same key is harmless).
        const sshPublicKey = await provision(username, user.id)
        await updateSshPublicKey(username, sshPublicKey)
        await updatePassword(username, hashPassword(secret))
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

const bootstrap = createBootstrap({
    findByUsername: repository.findByUsername,
    updatePassword: repository.updatePassword,
    updateSshPublicKey: repository.updateSshPublicKey,
    provision: defaultProvision,
    hashPassword: defaultHashPassword,
    readSecret: name => process.env[name]
})

export {bootstrap, createBootstrap, SYSTEM_USERS}
