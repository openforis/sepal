export const createReconciler = ({workerClient, openSessionUse, clock = () => new Date()}) => {
    const reconcile = async () => {
        const open = await workerClient.openSessions()
        const openIds = new Set(open.map(s => s.sessionId))

        // Missed Activated: (re-)open every session the worker reports.
        for (const s of open) {
            await openSessionUse.openSession({
                sessionId: s.sessionId,
                username: s.username,
                instanceType: s.instanceType,
                from: new Date(s.creationTime),
            })
        }

        // Missed Closed: close rows still open here that the worker no longer reports.
        const sessionIds = await openSessionUse.openSessionIds()
        const now = clock()
        for (const sessionId of sessionIds) {
            if (!openIds.has(sessionId))
                await openSessionUse.closeSession({sessionId, to: now})
        }
    }
    return {reconcile}
}
