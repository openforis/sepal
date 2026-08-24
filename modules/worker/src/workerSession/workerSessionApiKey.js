// WorkerSessionApiKey — the real SandboxSessionApiKey implementation.
//
// createWorkerSessionApiKey(repo) → { apiKeyForInstance(instanceId) }.
//
// apiKeyForInstance does a SINGLE session lookup (sessionOnInstance for PENDING/ACTIVE) and
// returns the session's apiKey, or null when no such session exists yet. It does NOT retry:
// the 5×50ms retry that bridges the commit race (InstancePendingProvisioning can fire before
// the RequestSession row commits) comes from createApiKeyRetryWrapper
// (workerInstance/sandboxSessionApiKey.js), which hostingService/index.js wraps around this
// impl — one lookup per attempt, never a double retry.

import {State} from './workerSession.js'

const {PENDING, ACTIVE} = State

const createWorkerSessionApiKey = repo => ({
    // Single lookup — NO retry here (createApiKeyRetryWrapper provides the 5×50ms).
    apiKeyForInstance: async instanceId => {
        const session = await repo.sessionOnInstance(instanceId, [PENDING, ACTIVE])
        return session ? session.apiKey : null
    }
})

export {createWorkerSessionApiKey}
