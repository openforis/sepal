// In-memory set of over-budget users, fed level-triggered by the budget module's
// budget.UserBudgetExceeded / budget.UserBudgetCleared events (re-published every enforcement
// cycle). requestSession asks the budget module for a live verdict and only falls back to
// isLocked() when that call fails, so this set is the fallback gate, not the authoritative one.
//
// Closing an over-budget user's running sessions is LEVEL-triggered: EVERY Exceeded delivery
// runs closeUserSessions, not just the one that first locked the user. That is what makes the
// close self-healing — closeUserSessions logs and skips per-session failures, and can fail
// outright if the repository is unreachable, so an edge-triggered close would leave those
// sessions running (and billing) forever. Re-running is cheap and idempotent: for a user whose
// sessions are already closed it is one indexed PENDING/ACTIVE lookup that returns nothing.
//
// A delivery arriving while that user's close is still in flight is DROPPED, not queued: the
// enforcement cycle redelivers anyway, and queueing would let a slow close (AWS instance release)
// stack up one pending close per cycle.
//
// onExceeded returns a promise that settles when this delivery's work is done (immediately for a
// dropped one). It NEVER rejects and never throws synchronously — closeUserSessions' rejections
// and synchronous throws are both swallowed here, so a misbehaving close can't escape into the
// message-queue subscriber.
export const createLockedUsers = ({closeUserSessions}) => {
    const locked = new Set()
    // username → the in-flight close promise (present only while a close is running).
    const closing = new Map()

    // closeNow — invoke closeUserSessions, absorbing a synchronous throw and a rejected promise
    // alike into a resolved one.
    const closeNow = username => {
        try {
            return Promise.resolve(closeUserSessions(username)).catch(() => {})
        } catch (_error) {
            return Promise.resolve()
        }
    }

    const onExceeded = ({username}) => {
        locked.add(username)
        if (closing.has(username)) {
            return Promise.resolve() // a close is already running for this user — drop
        }
        const run = closeNow(username)
        closing.set(username, run)
        return run.finally(() => closing.delete(username))
    }

    const onCleared = ({username}) => {
        locked.delete(username)
    }

    const isLocked = username => locked.has(username)

    return {onExceeded, onCleared, isLocked}
}
