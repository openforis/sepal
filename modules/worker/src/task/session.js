// Task-layer session shape + mapper. The task orchestrator only ever needs a projection of the
// full worker session:
//   {id, instanceType, username, host, state}
// where `host` is the instance host and `state` is PENDING | ACTIVE | CLOSED.

const ACTIVE = 'ACTIVE'

// Null-safe projection of the worker session domain object down to the task-layer shape.
// Returns null for a null session.
const toTaskSession = session => {
    if (!session) {
        return null
    }
    return {
        id: session.id,
        instanceType: session.instanceType,
        username: session.username,
        host: session.host ?? session.instance?.host ?? null,
        state: session.state,
    }
}

const isActiveSession = session => session?.state === ACTIVE

export {isActiveSession, toTaskSession}
