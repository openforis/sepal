// The storage handler goes through budgetCommands.updateUserStorageUsage rather than
// budgetRepository.updateUserStorageUse: the command runs the gb-hours accumulation that a raw
// repository write would skip.
export const createSessionEventHandlers = ({openSessionUse, budgetCommands}) => {
    // Requested and Activated carry the same payload and open the same row. Both are handled
    // because either can be the first to arrive: Requested bills a session that is closed before
    // it ever activates, Activated heals a lost Requested. The upsert is keyed on session_id and
    // writes identical values, so the second delivery is a no-op re-write.
    const openUse = ({username, session}) =>
        openSessionUse.openSession({
            sessionId: session.id,
            username,
            instanceType: session.instanceType,
            from: new Date(session.creationTime),
        })

    const onWorkerSessionRequested = openUse
    const onWorkerSessionActivated = openUse

    const onWorkerSessionClosed = ({sessionId}, now = new Date()) =>
        openSessionUse.closeSession({sessionId, to: now})

    const onUserStorageSize = async ({username, size}) => {
        if (username == null || size == null) {
            return
        }
        await budgetCommands.updateUserStorageUsage(username, size / 1e9) // bytes → GB
        await budgetCommands.updateUserSpendingReport(username)
    }

    return {onWorkerSessionRequested, onWorkerSessionActivated, onWorkerSessionClosed, onUserStorageSize}
}
