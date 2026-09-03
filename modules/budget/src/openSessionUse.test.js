import {createOpenSessionUse} from './openSessionUse.js'

const fakePool = () => {
    const rows = new Map()
    const pool = () => ({
        query: async (sql, params) => {
            if (/INSERT INTO open_session_use/.test(sql)) {
                if (params.length === 4) {
                    const [id, u, t, from] = params
                    const existing = rows.get(id)
                    rows.set(id, existing
                        ? {...existing, username: u, instance_type: t, from_time: from}
                        : {session_id: id, username: u, instance_type: t, from_time: from, to_time: null})
                } else {
                    const [id, from, to] = params
                    const existing = rows.get(id)
                    rows.set(id, existing
                        ? {...existing, to_time: to}
                        : {session_id: id, username: '', instance_type: '', from_time: from, to_time: to})
                }
                return [{}]
            }
            if (/UPDATE open_session_use SET to_time/.test(sql)) {
                const [to, id] = params
                if (rows.has(id)) {
                    rows.get(id).to_time = to
                    return [{affectedRows: 1}]
                }
                return [{affectedRows: 0}]
            }
        }
    })
    return {pool, rows}
}

test('openSession is idempotent by session_id', async () => {
    const {pool, rows} = fakePool()
    const repo = createOpenSessionUse(pool)
    const s = {sessionId: 's1', username: 'u', instanceType: 'T3aSmall', from: new Date('2026-07-01T00:00:00Z')}
    await repo.openSession(s)
    await repo.openSession(s)  // duplicate delivery
    expect(rows.size).toBe(1)
})

test('closeSession stamps to_time; tolerates Closed before Activated', async () => {
    const {pool, rows} = fakePool()
    const repo = createOpenSessionUse(pool)
    await repo.closeSession({sessionId: 's2', to: new Date('2026-07-02T00:00:00Z')})
    expect(rows.get('s2').to_time).toEqual(new Date('2026-07-02T00:00:00Z'))
})

test('closeSession after openSession stamps to_time without clobbering username/instanceType', async () => {
    const {pool, rows} = fakePool()
    const repo = createOpenSessionUse(pool)
    const s = {sessionId: 's3', username: 'u3', instanceType: 'T3aSmall', from: new Date('2026-07-01T00:00:00Z')}
    await repo.openSession(s)
    await repo.closeSession({sessionId: 's3', to: new Date('2026-07-03T00:00:00Z')})
    expect(rows.size).toBe(1)
    expect(rows.get('s3')).toMatchObject({username: 'u3', instance_type: 'T3aSmall'})
    expect(rows.get('s3').to_time).toEqual(new Date('2026-07-03T00:00:00Z'))
})

test('closeSession is idempotent by session_id (duplicate delivery, no Activated)', async () => {
    const {pool, rows} = fakePool()
    const repo = createOpenSessionUse(pool)
    const to = new Date('2026-07-04T00:00:00Z')
    await repo.closeSession({sessionId: 's4', to})
    await repo.closeSession({sessionId: 's4', to}) // duplicate delivery
    expect(rows.size).toBe(1)
    expect(rows.get('s4').to_time).toEqual(to)
})

test('closeSession before openSession (Closed-before-Activated) creates a placeholder that a later openSession corrects, preserving to_time', async () => {
    const {pool, rows} = fakePool()
    const repo = createOpenSessionUse(pool)
    const t0 = new Date('2026-07-01T00:00:00Z')
    const t1 = new Date('2026-07-02T00:00:00Z')
    await repo.closeSession({sessionId: 's3', to: t1})  // no row yet -> fallback INSERT
    await repo.openSession({sessionId: 's3', username: 'u', instanceType: 'T3aSmall', from: t0})
    expect(rows.size).toBe(1)
    expect(rows.get('s3')).toMatchObject({
        username: 'u',
        instance_type: 'T3aSmall',
        from_time: t0,
        to_time: t1
    })
})
