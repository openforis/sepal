import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'

const log = getLogger('worker/recoverStartup')
const RECOVERY_WAIT_MS = 10 * 60_000

// Stopping fences Docker; submitted EC2 storage operations must also finish before reuse.
export const recoverStartup = async ({instanceId, sessionId, claims, provider, releaseToken, onRecoveryAccepted}) => {
    if (!await claims.startRecovery(instanceId, sessionId)) return false
    const isCurrent = () => releaseToken?.isCurrent() ?? true
    if (!isCurrent()) return false
    if (!releaseToken?.scratch) {
        await retire({instanceId, sessionId, claims, provider, isCurrent})
        return false
    }
    try {
        await provider.beginRecovery(instanceId)
        onRecoveryAccepted()
        const [, device] = await waitForRecovery(Promise.all([
            provider.awaitStopped(instanceId), releaseToken.scratch,
        ]))
        if (!isCurrent()) return false
        await provider.deleteScratchVolume(instanceId, {requireAttached: !!device})
        if (!isCurrent()) return false
        await provider.pool(instanceId)
        return isCurrent()
    } catch (error) {
        log.warn(`Recovery of ${instanceTag(instanceId)} failed: ${error.message}`)
        await retire({instanceId, sessionId, claims, provider, isCurrent})
        return false
    }
}

const retire = async ({instanceId, sessionId, claims, provider, isCurrent}) => {
    if (!isCurrent()) return
    await provider.terminate(instanceId)
    if (isCurrent()) await claims.finishRecovery(instanceId, sessionId)
}

const waitForRecovery = async pending => {
    let timer
    try {
        return await Promise.race([
            pending,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Stopped-host recovery timed out')), RECOVERY_WAIT_MS)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}
