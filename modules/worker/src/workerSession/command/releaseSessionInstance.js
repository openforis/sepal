// ReleaseSessionInstance — the second step of every close that tears down an instance: release it,
// then revoke the session's api key, whether or not the release succeeded.
//
// The key outlives the closed row until then because the Data mount sidecar refreshes its
// credentials with it while the release waits for its pending uploads. The release stops the
// sandbox first, so by then only the sidecar still holds the key.

export const releaseSessionInstance = async ({sessionId, instanceId}, {repo, releaseInstance}) => {
    try {
        await releaseInstance(instanceId)
    } finally {
        await repo.clearApiKey(sessionId)
    }
}
