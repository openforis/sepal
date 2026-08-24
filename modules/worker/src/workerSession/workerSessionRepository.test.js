// Unit tests for workerSessionRepository.js
// Mocks db.js so no database is needed — verifies SQL strings, params, dispatch, and return values.
// Integration tests live in workerSessionRepository.integration.test.js.

import {jest} from '@jest/globals'

const query = jest.fn()
const mockPool = {query}

jest.unstable_mockModule('../db.js', () => ({
    getPool: () => mockPool
}))

const {createWorkerSessionRepository} = await import('./workerSessionRepository.js')
const {State, createWorkerSession} = await import('./workerSession.js')

const FIXED_NOW = new Date('2026-01-01T12:00:00Z')
const clock = () => FIXED_NOW

// repo bound to the mocked getPool (pool=null) so we also cover the default-pool path
const repo = createWorkerSessionRepository(null, clock)

const session = overrides => createWorkerSession({
    id: 's-1',
    state: State.PENDING,
    username: 'alice',
    workerType: 'SANDBOX',
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: 'host-1'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    timeoutTime: new Date('2026-01-01T00:30:00Z'),
    apiKey: 'key-1',
    ...overrides,
})

beforeEach(() => query.mockReset())

describe('insert', () => {
    test('INSERT carries the startup-lease deadline', async () => {
        query.mockResolvedValue([{}, []])
        await repo.insert(session())
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/INSERT INTO worker_session\(state, username, worker_type, instance_type, instance_id, host, creation_time, update_time, id, api_key, timeout_time\)/i)
        expect(params).toEqual([
            'PENDING', 'alice', 'SANDBOX', 'T3aSmall', 'i-1',
            'host-1', new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'), 's-1',
            'key-1', new Date('2026-01-01T00:30:00Z'),
        ])
    })
})

describe('update', () => {
    test('PENDING/ACTIVE variant: sets state and update_time (no api_key null)', async () => {
        query.mockResolvedValue([{}, []])
        await repo.update(session({state: State.ACTIVE}))
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SET state = \?, update_time = \?\s+WHERE id = \?/i)
        expect(sql).not.toMatch(/api_key/i)
        expect(params).toEqual(['ACTIVE', FIXED_NOW, 's-1'])
    })

    test('CLOSED variant: ALSO sets api_key = NULL', async () => {
        query.mockResolvedValue([{}, []])
        await repo.update(session({state: State.CLOSED}))
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SET state = \?, update_time = \?, api_key = NULL\s+WHERE id = \?/i)
        expect(params).toEqual(['CLOSED', FIXED_NOW, 's-1'])
    })

    test('update_time comes from the injected clock', async () => {
        query.mockResolvedValue([{}, []])
        await repo.update(session({state: State.PENDING}))
        const [, params] = query.mock.calls[0]
        expect(params[1]).toBe(FIXED_NOW)
    })

    // The deadline moves through extendSession and nowhere else — a stale in-memory session must
    // not be able to undo a ratchet that landed while it was held.
    test('never writes timeout_time', async () => {
        query.mockResolvedValue([{}, []])
        await repo.update(session({state: State.ACTIVE}))
        const [sql] = query.mock.calls[0]
        expect(sql).not.toMatch(/timeout_time/i)
    })

    test('update to CLOSED cascades session_app delete', async () => {
        const deleteForSession = jest.fn(async () => {})
        const repo = createWorkerSessionRepository(null, () => FIXED_NOW, {deleteForSession})
        const closed = session({state: 'CLOSED'})
        await repo.update(closed)
        expect(deleteForSession).toHaveBeenCalledWith(closed.id)
    })

    test('update to ACTIVE does not touch session_app', async () => {
        const deleteForSession = jest.fn(async () => {})
        const repo = createWorkerSessionRepository(null, () => FIXED_NOW, {deleteForSession})
        await repo.update(session({state: 'ACTIVE'}))
        expect(deleteForSession).not.toHaveBeenCalled()
    })
})

describe('getSession', () => {
    test('returns a reconstructed session', async () => {
        query.mockResolvedValue([[{
            id: 's-9', state: 'ACTIVE', username: 'BOB', worker_type: 'SANDBOX', instance_type: 'T3aSmall',
            instance_id: 'i-9', host: 'host-9',
            creation_time: '2026-01-01 00:00:00', update_time: '2026-01-01 00:05:00', api_key: 'k',
            timeout_time: '2026-01-01 00:35:00', last_interaction_time: null,
            active_time: '2026-01-01 00:05:00', notification_state: 'NONE', notified_time: null,
        }], []])
        const s = await repo.getSession('s-9')
        expect(s.id).toBe('s-9')
        expect(s.username).toBe('bob') // lowercased
        expect(s.instance).toEqual({id: 'i-9', host: 'host-9'})
        expect(s.host).toBe('host-9')
    })

    test('throws when the row is missing (Groovy parity)', async () => {
        query.mockResolvedValue([[], []])
        await expect(repo.getSession('nope')).rejects.toThrow(/Non-existing worker session: nope/)
    })
})

describe('userSessions', () => {
    test('username only: WHERE username = ?; no optional clauses', async () => {
        query.mockResolvedValue([[], []])
        await repo.userSessions('alice')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE username = \?/i)
        expect(sql).not.toMatch(/worker_type = \?/i)
        expect(sql).not.toMatch(/state IN/i)
        expect(sql).not.toMatch(/instance_type = \?/i)
        expect(sql).toMatch(/ORDER BY creation_time/i)
        expect(params).toEqual(['alice'])
    })

    test('all filters: param order [username, workerType, ...states, instanceType]', async () => {
        query.mockResolvedValue([[], []])
        await repo.userSessions('alice', [State.PENDING, State.ACTIVE], 'SANDBOX', 'T3aSmall')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/worker_type = \?/i)
        expect(sql).toMatch(/state IN \(\?, \?\)/i)
        expect(sql).toMatch(/instance_type = \?/i)
        expect(params).toEqual(['alice', 'SANDBOX', 'PENDING', 'ACTIVE', 'T3aSmall'])
    })

    test('states only', async () => {
        query.mockResolvedValue([[], []])
        await repo.userSessions('alice', [State.ACTIVE])
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/state IN \(\?\)/i)
        expect(params).toEqual(['alice', 'ACTIVE'])
    })
})

describe('sessions', () => {
    test('SELECT WHERE state in (...)', async () => {
        query.mockResolvedValue([[], []])
        await repo.sessions([State.PENDING, State.ACTIVE])
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE state in \(\?, \?\)/i)
        expect(params).toEqual(['PENDING', 'ACTIVE'])
    })
})

describe('allOpenSessions', () => {
    test('SELECT across ALL users, WHERE state IN (PENDING, ACTIVE), no params', async () => {
        query.mockResolvedValue([[], []])
        await repo.allOpenSessions()
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SELECT username, id AS sessionId, instance_type, creation_time/i)
        expect(sql).toMatch(/FROM worker_session/i)
        expect(sql).toMatch(/WHERE state IN \('PENDING', 'ACTIVE'\)/i)
        expect(params).toBeUndefined()
    })

    test('maps rows to [{username (lowercased), sessionId, instanceType, creationTime}]', async () => {
        query.mockResolvedValue([[
            {username: 'ALICE', sessionId: 's-1', instance_type: 'T3aSmall', creation_time: '2026-01-01 00:00:00'},
            {username: 'bob', sessionId: 's-2', instance_type: 'M6aLarge', creation_time: '2026-01-02 00:00:00'},
        ], []])
        const result = await repo.allOpenSessions()
        expect(result).toEqual([
            {username: 'alice', sessionId: 's-1', instanceType: 'T3aSmall', creationTime: new Date('2026-01-01 00:00:00')},
            {username: 'bob', sessionId: 's-2', instanceType: 'M6aLarge', creationTime: new Date('2026-01-02 00:00:00')},
        ])
    })

    test('empty result → []', async () => {
        query.mockResolvedValue([[], []])
        expect(await repo.allOpenSessions()).toEqual([])
    })
})

describe('timedOutSessions', () => {
    // PENDING only. Sweeping ACTIVE rows on update_time freshness is precisely the derived timeout
    // this design replaced; an ACTIVE session now lives by its stored deadline.
    test('PENDING only, on update_time freshness', async () => {
        query.mockResolvedValue([[], []])
        await repo.timedOutSessions()
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE state = \? AND update_time < \?/i)
        expect(sql).not.toMatch(/earliest_timeout_time/i)
        const lastValid = new Date(FIXED_NOW.getTime() - 10 * 60 * 1000)
        expect(params).toEqual(['PENDING', lastValid])
    })

    test('never selects ACTIVE sessions', async () => {
        query.mockResolvedValue([[], []])
        await repo.timedOutSessions()
        const [, params] = query.mock.calls[0]
        expect(params).not.toContain('ACTIVE')
    })
})

// ── the ratchet ──────────────────────────────────────────────────────────────
describe('extendSession', () => {
    test('is ONE statement: deadline, interaction stamp and notification reset together', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: true})
        expect(query).toHaveBeenCalledTimes(1)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/notification_state = IF\(.+, 'NONE', notification_state\)/i)
        expect(sql).toMatch(/notified_time = IF\(.+, NULL, notified_time\)/i)
        expect(sql).toMatch(/last_interaction_time = IF\(\?, NOW\(\), last_interaction_time\)/i)
    })

    // Regression, found in live simulation. Cancelling the cycle unconditionally meant a ratchet
    // the cap had clamped into the past — one that moves the deadline NOT AT ALL — still cleared
    // the notification, so a session past its cap under continuous load re-notified every sweep
    // and never reached the end of its grace. Load stopped buying time and then bought it back
    // through the reset.
    test('the notification reset is conditional on the deadline actually moving', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, capHours: 12})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/> COALESCE\(timeout_time, NOW\(\)\)/i)
        expect(sql).not.toMatch(/notification_state = 'NONE'\s*,/i)
    })

    // MySQL evaluates SET clauses left to right and later ones see what earlier ones wrote, so the
    // conditional columns must be assigned BEFORE timeout_time — otherwise they would compare
    // against the deadline this same statement just set, and the condition would never hold.
    test('the conditional columns are assigned before timeout_time', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, capHours: 12})
        const [sql] = query.mock.calls[0]
        expect(sql.indexOf('notification_state')).toBeLessThan(sql.indexOf('timeout_time = GREATEST'))
        expect(sql.indexOf('notified_time')).toBeLessThan(sql.indexOf('timeout_time = GREATEST'))
    })

    test('is monotonic — GREATEST over the existing deadline, COALESCE for the first write', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/timeout_time = GREATEST\(COALESCE\(timeout_time, NOW\(\)\), NOW\(\) \+ INTERVAL \? MINUTE\)/i)
    })

    test('derives every timestamp from the database clock, never the caller\'s', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: true})
        const [sql, params] = query.mock.calls[0]
        expect(sql).not.toMatch(/timeout_time = \?/i)
        expect(params.some(p => p instanceof Date)).toBe(false)
    })

    test('only ACTIVE sessions ratchet', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE id = \? AND state = 'ACTIVE'/i)
    })

    test('interaction=false leaves last_interaction_time alone — that IS the cap mechanism', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: false})
        const [, params] = query.mock.calls[0]
        // The candidate appears three times: twice in the conditional reset, once in GREATEST.
        expect(params).toEqual([15, 15, 0, 15, 's-1'])
    })

    test('returns whether a row changed, for the one-shot senders', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.extendSession({sessionId: 's-1', minutes: 15})).toBe(false)
        query.mockResolvedValue([{affectedRows: 1}, []])
        expect(await repo.extendSession({sessionId: 's-1', minutes: 15})).toBe(true)
    })
})

describe('setSessionTimeout — the keep-alive slider', () => {
    // The ONE write that is not a ratchet. No GREATEST: the cursor shows the current keep-alive,
    // and moving it means "make it this much", in either direction.
    test('REPLACES the deadline rather than ratcheting it', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.setSessionTimeout({sessionId: 's-1', minutes: 180})
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/timeout_time = NOW\(\) \+ INTERVAL \? MINUTE/i)
        expect(sql).not.toMatch(/GREATEST/i)
        expect(params).toEqual([180, 's-1'])
    })

    // A deliberate one-off act earns the reset in either direction — unlike the ratchet, whose
    // condition exists to stop the sampler cancelling a warning it did not earn.
    test('resets the notification cycle unconditionally', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.setSessionTimeout({sessionId: 's-1', minutes: 0})
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/notification_state = 'NONE'/i)
        expect(sql).toMatch(/notified_time = NULL/i)
        expect(sql).not.toMatch(/IF\(/i)
    })

    test('stamps the interaction, so it re-anchors the unattended cap', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.setSessionTimeout({sessionId: 's-1', minutes: 60})
        expect(query.mock.calls[0][0]).toMatch(/last_interaction_time = NOW\(\)/i)
    })

    test('only ACTIVE sessions are settable', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.setSessionTimeout({sessionId: 's-1', minutes: 60})).toBe(false)
        expect(query.mock.calls[0][0]).toMatch(/WHERE id = \? AND state = 'ACTIVE'/i)
    })
})

describe('extendSession — the cap', () => {
    test('CLAMPS the candidate rather than refusing the write', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, capHours: 12})
        const [sql, params] = query.mock.calls[0]
        // Clamping subsumes refusal: past the boundary the clamped candidate is already in the
        // past, so GREATEST keeps the existing deadline. Refusing instead would let a verdict
        // landing one second before the boundary push past it by a whole extension.
        expect(sql).toMatch(/LEAST\(NOW\(\) \+ INTERVAL \? MINUTE, COALESCE\(last_interaction_time, active_time, creation_time\) \+ INTERVAL \? MINUTE\)/i)
        // MINUTES, not hours: MySQL rounds a fractional INTERVAL n HOUR instead of rejecting it,
        // so a 0.1-hour cap silently became zero — which disables the busy ratchet completely,
        // because the clamp then always resolves to the anchor itself. Found in live simulation.
        expect(params).toEqual([15, 720, 15, 720, 0, 15, 720, 's-1'])
    })

    test('the anchor is never NULL — an uncapped busy ratchet is the failure it exists to prevent', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, capHours: 12})
        const [sql] = query.mock.calls[0]
        // creation_time is NOT NULL, so `now - anchor` is always a number: with a bare
        // last_interaction_time the comparison would be NULL for every session that never had a
        // human interaction, and the cap would silently not apply to exactly those.
        expect(sql).toMatch(/COALESCE\(last_interaction_time, active_time, creation_time\)/i)
    })

    test('human and task events are never capped', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: true})
        const [sql] = query.mock.calls[0]
        expect(sql).not.toMatch(/LEAST/i)
    })

    // Regression, found in live simulation. Expressed in HOURS, MySQL rounded `INTERVAL 0.1 HOUR`
    // to zero, so the clamp resolved to the anchor itself and the busy ratchet silently stopped
    // extending anything at all — nothing errored, load-based keep-alive was simply gone. (0.5
    // rounded the other way, to a full hour.) Minutes are integral for any sane cap.
    test('a fractional cap reaches SQL as whole minutes, never fractional hours', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.extendSession({sessionId: 's-1', minutes: 15, capHours: 0.1})
        const [sql, params] = query.mock.calls[0]
        expect(sql).not.toMatch(/HOUR/i)
        expect(params).toEqual([15, 6, 15, 6, 0, 15, 6, 's-1'])
    })
})

// ── the expiry sweep's compare-and-set transitions ───────────────────────────
describe('expiredSessions', () => {
    test('ACTIVE, past deadline, and no PENDING/ACTIVE task', async () => {
        query.mockResolvedValue([[], []])
        await repo.expiredSessions()
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/s\.state = 'ACTIVE'/i)
        expect(sql).toMatch(/s\.timeout_time < NOW\(\)/i)
        expect(sql).toMatch(/NOT EXISTS/i)
        expect(sql).toMatch(/t\.state IN \('PENDING', 'ACTIVE'\)/i)
    })

    test('a NULL deadline never expires', async () => {
        query.mockResolvedValue([[], []])
        await repo.expiredSessions()
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/s\.timeout_time IS NOT NULL/i)
    })
})

describe('notification transitions', () => {
    test('notifyExpiry is guarded on NONE, so exactly one sweep observes it', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        expect(await repo.notifyExpiry('s-1')).toBe(true)
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/notification_state = 'NONE'/i)
        expect(sql).toMatch(/timeout_time < NOW\(\)/i)
    })

    test('notifyExpiry returns false when another sweep won', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.notifyExpiry('s-1')).toBe(false)
    })

    test('markEmailed is guarded on the notified_time observed', async () => {
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.markEmailed('s-1', notifiedTime)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/notification_state = 'NOTIFIED' AND notified_time = \?/i)
        expect(params).toEqual(['s-1', notifiedTime])
    })

    test('dismiss suppresses the email without moving the deadline', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.dismissNotification('s-1', 'alice')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SET notification_state = 'DISMISSED'/i)
        expect(sql).not.toMatch(/timeout_time/i)
        expect(params).toEqual(['s-1', 'alice'])
    })

    test('notify-mode reset also pushes the deadline, or it would re-notify every minute', async () => {
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.restartExpiryCycle('s-1', notifiedTime, 60)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/notification_state = 'NONE'/i)
        expect(sql).toMatch(/timeout_time = GREATEST\(COALESCE\(timeout_time, NOW\(\)\), NOW\(\) \+ INTERVAL \? MINUTE\)/i)
        expect(params).toEqual([60, 's-1', notifiedTime])
    })
})

describe('closeExpiredSession', () => {
    const args = {
        sessionId: 's-1',
        notificationState: 'NOTIFIED',
        notifiedTime: new Date('2026-01-01T11:00:00Z'),
        graceMinutes: 60,
    }

    // The sweep may never act on a fact it read earlier: every decision is re-asserted as a
    // predicate in the statement that acts on it.
    test('re-asserts every decision the sweep made', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await repo.closeExpiredSession(args)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/state = 'ACTIVE'/i)
        expect(sql).toMatch(/timeout_time < NOW\(\)/i)
        expect(sql).toMatch(/notification_state = \?/i)
        expect(sql).toMatch(/notified_time = \?/i)
        expect(sql).toMatch(/notified_time < NOW\(\) - INTERVAL \? MINUTE/i)
        expect(sql).toMatch(/NOT EXISTS/i)
        expect(params).toEqual(['s-1', 'NOTIFIED', args.notifiedTime, 60])
    })

    test('an interaction landing between selection and close leaves the session open', async () => {
        const deleteForSession = jest.fn(async () => {})
        const repo = createWorkerSessionRepository(null, clock, {deleteForSession})
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.closeExpiredSession(args)).toBe(false)
        expect(deleteForSession).not.toHaveBeenCalled()
    })

    test('a real close cascades the app associations', async () => {
        const deleteForSession = jest.fn(async () => {})
        const repo = createWorkerSessionRepository(null, clock, {deleteForSession})
        query.mockResolvedValue([{affectedRows: 1}, []])
        expect(await repo.closeExpiredSession(args)).toBe(true)
        expect(deleteForSession).toHaveBeenCalledWith('s-1')
    })
})

describe('redeemExtension', () => {
    // The HMAC alone proves only that the token is well-formed — two concurrent clicks both
    // verify. Single-use comes from the write.
    test('is guarded on the notified_time the token was signed against', async () => {
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        query.mockResolvedValue([{affectedRows: 1}, []])
        expect(await repo.redeemExtension({sessionId: 's-1', notifiedTime, minutes: 15})).toBe(true)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/state = 'ACTIVE' AND notified_time = \?/i)
        expect(sql).toMatch(/notified_time = NULL/i)
        expect(params).toEqual([15, 's-1', notifiedTime])
    })

    test('a second redemption changes no row', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.redeemExtension({
            sessionId: 's-1', notifiedTime: new Date(), minutes: 15
        })).toBe(false)
    })
})

describe('activateSession', () => {
    test('stamps active_time and re-ratchets the lease from activation', async () => {
        query.mockResolvedValueOnce([{affectedRows: 1}, []])
        query.mockResolvedValueOnce([[{
            id: 's-1', state: 'ACTIVE', username: 'alice', worker_type: 'SANDBOX',
            instance_type: 'T3aSmall', instance_id: 'i-1', host: 'host-1',
            creation_time: '2026-01-01 00:00:00', update_time: '2026-01-01 00:08:00',
            api_key: 'k', timeout_time: '2026-01-01 00:38:00', last_interaction_time: null,
            active_time: '2026-01-01 00:08:00', notification_state: 'NONE', notified_time: null,
        }], []])
        const activated = await repo.activateSession('s-1', 30)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SET state = 'ACTIVE'/i)
        expect(sql).toMatch(/active_time = NOW\(\)/i)
        expect(sql).toMatch(/timeout_time = GREATEST\(COALESCE\(timeout_time, NOW\(\)\), NOW\(\) \+ INTERVAL \? MINUTE\)/i)
        expect(params).toEqual([30, 's-1'])
        expect(activated.state).toBe('ACTIVE')
        expect(activated.activeTime).toEqual(new Date('2026-01-01 00:08:00'))
    })

    test('guarded on PENDING — a second caller gets null and announces nothing', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await repo.activateSession('s-1', 30)).toBeNull()
        expect(query).toHaveBeenCalledTimes(1)
    })
})

describe('sessionOnInstance', () => {
    test('WHERE instance_id = ? AND state in (...); returns null when none', async () => {
        query.mockResolvedValue([[], []])
        const s = await repo.sessionOnInstance('i-1', [State.PENDING, State.ACTIVE])
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE instance_id = \? AND state in \(\?, \?\)/i)
        expect(params).toEqual(['i-1', 'PENDING', 'ACTIVE'])
        expect(s).toBeNull()
    })
})

describe('findUsernameByApiKey', () => {
    test('null apiKey short-circuits without querying', async () => {
        const r = await repo.findUsernameByApiKey(null)
        expect(r).toBeNull()
        expect(query).not.toHaveBeenCalled()
    })

    test('WHERE api_key = ? AND state IN (PENDING, ACTIVE); lowercases username', async () => {
        query.mockResolvedValue([[{username: 'ALICE'}], []])
        const r = await repo.findUsernameByApiKey('key-1')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/WHERE api_key = \? AND state IN \(\?, \?\)/i)
        expect(params).toEqual(['key-1', 'PENDING', 'ACTIVE'])
        expect(r).toBe('alice')
    })

    test('returns null when no row', async () => {
        query.mockResolvedValue([[], []])
        expect(await repo.findUsernameByApiKey('key-x')).toBeNull()
    })
})

describe('mostRecentlyClosedSessionByUser', () => {
    test('returns { <username-lowercased>: Date } and targets unqualified worker_session', async () => {
        query.mockResolvedValue([[{username: 'ALICE', update_time: '2026-01-01 00:00:00'}], []])
        const r = await repo.mostRecentlyClosedSessionByUser()
        const [sql] = query.mock.calls[0]
        expect(sql).toMatch(/FROM `worker_session`/i)
        expect(sql).not.toMatch(/sdms/i)
        expect(Object.keys(r)).toEqual(['alice'])
        expect(r.alice).toEqual(new Date('2026-01-01 00:00:00'))
    })
})

describe('mostRecentlyClosedSession', () => {
    test('returns { timestamp: Date } when found', async () => {
        query.mockResolvedValue([[{username: 'alice', update_time: '2026-01-01 00:00:00'}], []])
        const r = await repo.mostRecentlyClosedSession('alice')
        const [sql, params] = query.mock.calls[0]
        expect(sql).not.toMatch(/sdms/i)
        expect(params).toEqual(['alice'])
        expect(r).toEqual({timestamp: new Date('2026-01-01 00:00:00')})
    })

    test('returns {} when not found', async () => {
        query.mockResolvedValue([[], []])
        expect(await repo.mostRecentlyClosedSession('nobody')).toEqual({})
    })
})
