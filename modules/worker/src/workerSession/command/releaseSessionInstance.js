// ReleaseSessionInstance — the second step of every close that tears down an instance: release it,
// then revoke the session's api key, whether or not the release succeeded.
//
// The key outlives the closed row until then because the Data mount sidecar refreshes its
// credentials with it while the release waits for its pending uploads. The release stops the
// sandbox first, so by then only the sidecar still holds the key. Should this process die first,
// the key stops resolving anyway once the release's claim is gone (findSessionByApiKey).

import {getLogger} from '#sepal/log'

const log = getLogger('worker/releaseSessionInstance')

export const releaseSessionInstance = async ({sessionId, instanceId}, {repo, releaseInstance}) => {
    try {
        await releaseInstance(instanceId)
    } finally {
        await clearApiKeyQuietly(sessionId, repo)
    }
}

// A failed revocation must not replace the release's own error.
const clearApiKeyQuietly = async (sessionId, repo) => {
    try {
        await repo.clearApiKey(sessionId)
    } catch (error) {
        log.error(`Failed to clear the api key of session ${sessionId}`, error)
    }
}
