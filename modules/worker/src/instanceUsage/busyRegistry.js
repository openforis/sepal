// busyRegistry — the latest busy verdict for each worker session, as the sampler last saw it.
//
// The verdict is already computed every tick to decide the busy ratchet (sampleInstances
// extendBusySessions); this is where it lives between that component and the session report, which
// labels the instance with it. A user reading "unused" in the Usage panel is therefore reading the
// very reason the session will be closed, not a second opinion computed some other way.
//
// In-memory and un-persisted, like terminalRegistry: it describes right now, and a worker restart
// losing it costs one sampler tick.
//
// A session with no entry — never sampled, or sampled below the coverage floor — reports 'unknown'
// rather than a verdict. Missing data must never render as "unused": that word is what tells a user
// their instance is about to be stopped.

const Verdict = Object.freeze({
    BUSY: 'busy',
    UNUSED: 'unused',
    UNKNOWN: 'unknown',
})

const createBusyRegistry = () => {
    const verdicts = new Map()

    return {
        set: (sessionId, verdict) => verdicts.set(sessionId, verdict),
        get: sessionId => verdicts.get(sessionId) ?? Verdict.UNKNOWN,
        forget: sessionId => verdicts.delete(sessionId),
        sessionIds: () => [...verdicts.keys()],
    }
}

export {createBusyRegistry, Verdict}
