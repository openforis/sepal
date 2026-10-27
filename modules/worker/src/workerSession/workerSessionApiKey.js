// WorkerSessionApiKey — the real SandboxSessionApiKey implementation.
//
// createWorkerSessionApiKey(repo) → { apiKeyForSession(instanceId, sessionId) }.
//
// apiKeyForSession does a SINGLE session lookup (sessionOnInstance for PENDING/ACTIVE) and
// returns the session's apiKey, or null when that session is not (yet, or any more) the one open
// on the instance. A provision that outlived its session must never be handed the key of the
// session holding the instance now. It does NOT retry:
// the 5×50ms retry that bridges the commit race (InstancePendingProvisioning can fire before
// the RequestSession row commits) comes from createApiKeyRetryWrapper
// (workerInstance/sandboxSessionApiKey.js), which hostingService/index.js wraps around this
// impl — one lookup per attempt, never a double retry.

import {State} from './workerSession.js'

const {PENDING, ACTIVE} = State

const createWorkerSessionApiKey = repo => ({
    // Single lookup — NO retry here (createApiKeyRetryWrapper provides the 5×50ms).
    apiKeyForSession: async (instanceId, sessionId) => {
        const session = await repo.sessionOnInstance(instanceId, [PENDING, ACTIVE])
        return session?.id === sessionId ? session.apiKey : null
    }
})

export {createWorkerSessionApiKey}
