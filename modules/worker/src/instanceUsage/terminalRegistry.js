// terminalRegistry — how many live terminal sessions each worker session currently has.
//
// The sampler already stats every pty in the container once a tick, so the count is free; this is
// just the place the number lives between the component that measures it and the sweep that needs
// it. It is deliberately IN-MEMORY and un-persisted: it describes what is running right now, it is
// only ever used to make a notification more informative, and a worker restart losing it costs one
// sampler tick.
//
// A session with no entry reports 0 rather than "unknown". That is the right default for the one
// consumer: an expiry notification that stays silent about terminals is better than one that
// claims a terminal is open on the strength of stale or missing data.

const createTerminalRegistry = () => {
    const counts = new Map()

    return {
        set: (sessionId, count) => counts.set(sessionId, count),
        get: sessionId => counts.get(sessionId) ?? 0,
        forget: sessionId => counts.delete(sessionId),
        sessionIds: () => [...counts.keys()],
    }
}

export {createTerminalRegistry}
