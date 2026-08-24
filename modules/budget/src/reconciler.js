export const createReconciler = ({workerClient, openSessionUse, pool, clock = () => new Date()}) => {
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
        const [rows] = await pool().query('SELECT session_id FROM open_session_use WHERE to_time IS NULL')
        const now = clock()
        for (const row of rows) {
            if (!openIds.has(row.session_id))
                await openSessionUse.closeSession({sessionId: row.session_id, to: now})
        }
    }
    return {reconcile}
}
