import {getLogger} from '#sepal/log'

import {provision as defaultProvision} from './provisioning.js'
import * as repository from './userRepository.js'

const log = getLogger('userProvisioning')

// Lazy provisioning: the SSH home + keypair and the SEPAL data home are NOT created at
// signup/invite — only when the user leaves PENDING (activate / password reset), so users who never
// activate cost no filesystem resources. Always runs the (idempotent) provision script, so a user
// leaving PENDING is guaranteed completely provisioned — home dir, data home and keypair — even
// when a key is already stored but the filesystem is missing. Callers decide when to invoke it;
// provision recursively chowns the data home, so don't call it on routine requests for
// already-provisioned users. Never throws: web access must not depend on provisioning; a failure
// here is logged and retried on the next activate/reset.
const createEnsureProvisioned = ({findByUsername, provision, updateSshPublicKey}) =>
    async user => {
        // Never invent a POSIX identity: chowning with a made-up uid/gid could orphan existing files.
        if (!Number.isInteger(user.uid) || !Number.isInteger(user.gid)) {
            log.warn(`Missing uid/gid for '${user.username}' (uid=${user.uid}, gid=${user.gid}) — cannot provision`)
            return user
        }
        try {
            const sshPublicKey = await provision(user.username, user.uid, user.gid)
            if (!sshPublicKey) {
                throw new Error('provision returned no public key')
            }
            await updateSshPublicKey(user.username, sshPublicKey)
            log.info(`Provisioned home, data home and SSH keypair for '${user.username}'`)
            return await findByUsername(user.username)
        } catch (error) {
            log.error(`Provisioning failed for '${user.username}'`, error)
            return user
        }
    }

const ensureProvisioned = createEnsureProvisioned({
    findByUsername: repository.findByUsername,
    provision: defaultProvision,
    updateSshPublicKey: repository.updateSshPublicKey
})

export {createEnsureProvisioned, ensureProvisioned}
