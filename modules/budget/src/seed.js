import {getLogger} from '#sepal/log'

const log = getLogger('sepal.budget.seed')

export const createSeed = ({workerClient, openSessionUse, pool}) => async () => {
    const [[{c}]] = await pool().query('SELECT COUNT(*) AS c FROM open_session_use')
    if (c > 0) {
        log.info('Seed: open_session_use already populated, skipping')
        return
    }
    const open = await workerClient.openSessions()
    for (const s of open) {
        await openSessionUse.openSession({
            sessionId: s.sessionId,
            username: s.username,
            instanceType: s.instanceType,
            from: new Date(s.creationTime),
        })
    }
    log.info(`Seed: populated open_session_use with ${open.length} currently-open session(s)`)
}
