// Unit tests for the expiry sweep: the notify → email → close cycle, its compare-and-set guards,
// the notify-mode reset, and the interleavings the "any extension cancels the expiry" claim
// depends on. Mocked repo, no database.

import {jest} from '@jest/globals'

import {expireSessions} from './expireSessions.js'

const NOW = new Date('2026-08-13T12:00:00Z')
const clock = () => NOW
const minutesAgo = minutes => new Date(NOW.getTime() - minutes * 60_000)

const policy = {
    notificationVisibleMinutes: 5,
    graceMinutes: 60,
    emailExtensionMinutes: 15,
}

const session = (overrides = {}) => ({
    id: 's-1',
    username: 'alice',
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: 'host-1'},
    notificationState: 'NONE',
    notifiedTime: null,
    apiKey: 'SECRET',
    ...overrides,
})

const makeRepo = (sessions = [], overrides = {}) => ({
    expiredSessions: jest.fn(async () => sessions),
    // describeSessions asks for the owner's open sessions to work out the ordinal the SSH menu
    // prints; by default this session is the only one, so it is instance 1.
    userSessions: jest.fn(async () => sessions.map(({id, username}) => ({id, username}))),
    notifyExpiry: jest.fn(async () => true),
    markEmailed: jest.fn(async () => true),
    restartExpiryCycle: jest.fn(async () => true),
    closeExpiredSession: jest.fn(async () => true),
    ...overrides,
})

const makeAppRepo = (apps = []) => ({
    appsForSessions: jest.fn(async ids => new Map(ids.map(id => [id, apps]))),
})

const run = (repo, overrides = {}) => expireSessions({
    repo,
    appRepo: makeAppRepo(),
    terminals: {get: () => 0},
    mode: 'enforce',
    policy,
    instanceTypeById: {T3aSmall: {name: 't3a.small', hourlyCost: 0.02}},
    sendEmail: jest.fn(),
    extendUrl: () => 'https://sepal.io/api/sessions/extend/tok',
    releaseInstance: jest.fn(async () => {}),
    emitSessionExpiryNotified: jest.fn(),
    emitSessionExpiryClosed: jest.fn(),
    emitWorkerSessionClosed: jest.fn(),
    emitSessionChanged: jest.fn(),
    clock,
    ...overrides,
})

describe('T+0 — notification', () => {
    test('a NONE session past its deadline is notified, once', async () => {
        const repo = makeRepo([session()])
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {emitSessionExpiryNotified})
        expect(repo.notifyExpiry).toHaveBeenCalledWith('s-1')
        expect(emitSessionExpiryNotified).toHaveBeenCalledTimes(1)
    })

    // The state advance is a guarded UPDATE, so exactly one sweep observes the transition even if
    // a sweep overruns its minute.
    test('losing the guarded transition emits nothing', async () => {
        const repo = makeRepo([session()], {notifyExpiry: jest.fn(async () => false)})
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {emitSessionExpiryNotified})
        expect(emitSessionExpiryNotified).not.toHaveBeenCalled()
    })

    test('the api key never leaves the worker', async () => {
        const repo = makeRepo([session()])
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {emitSessionExpiryNotified})
        expect(emitSessionExpiryNotified.mock.calls[0][0].session.apiKey).toBeNull()
    })
})

describe('T+notificationVisibleMinutes — email', () => {
    test('a still-NOTIFIED session gets the email with its extend link', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const sendEmail = jest.fn()
        await run(repo, {sendEmail})
        expect(repo.markEmailed).toHaveBeenCalledWith('s-1', minutesAgo(6))
        expect(sendEmail).toHaveBeenCalledTimes(1)
        expect(sendEmail.mock.calls[0][0].content).toContain('https://sepal.io/api/sessions/extend/tok')
    })

    test('before the visible window, nothing is sent', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(2)})])
        const sendEmail = jest.fn()
        await run(repo, {sendEmail})
        expect(sendEmail).not.toHaveBeenCalled()
    })

    // Dismiss means "I saw it, don't email me".
    test('a DISMISSED session is never emailed', async () => {
        const repo = makeRepo([session({notificationState: 'DISMISSED', notifiedTime: minutesAgo(30)})])
        const sendEmail = jest.fn()
        await run(repo, {sendEmail})
        expect(repo.markEmailed).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
    })

    test('losing the guarded transition sends no duplicate mail', async () => {
        const repo = makeRepo(
            [session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})],
            {markEmailed: jest.fn(async () => false)})
        const sendEmail = jest.fn()
        await run(repo, {sendEmail})
        expect(sendEmail).not.toHaveBeenCalled()
    })

    // A permanently failing address must not turn the sweep into a per-minute retry loop.
    test('a failing send does not block the sweep or retry next minute', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const sendEmail = jest.fn(() => { throw new Error('smtp down') })
        await expect(run(repo, {sendEmail})).resolves.toBeNull()
        expect(repo.markEmailed).toHaveBeenCalled() // state advanced regardless
    })
})

describe('T+graceMinutes — close', () => {
    const expiredPastGrace = (state = 'NOTIFIED') =>
        session({notificationState: state, notifiedTime: minutesAgo(61)})

    test.each(['NOTIFIED', 'DISMISSED', 'EMAILED'])('%s closes past grace', async state => {
        const repo = makeRepo([expiredPastGrace(state)])
        const releaseInstance = jest.fn(async () => {})
        const emitWorkerSessionClosed = jest.fn()
        const emitSessionExpiryClosed = jest.fn()
        await run(repo, {releaseInstance, emitWorkerSessionClosed, emitSessionExpiryClosed})
        expect(repo.closeExpiredSession).toHaveBeenCalledWith({
            sessionId: 's-1', notificationState: state, notifiedTime: minutesAgo(61), graceMinutes: 60,
        })
        expect(releaseInstance).toHaveBeenCalledWith('i-1')
        expect(emitWorkerSessionClosed).toHaveBeenCalledTimes(1)
        expect(emitSessionExpiryClosed).toHaveBeenCalledTimes(1)
    })

    // Selecting candidates and then closing them is a lost update waiting to happen: an
    // interaction landing in between must win, and the guarded close is what makes it win.
    test('a rescued session is not torn down', async () => {
        const repo = makeRepo([expiredPastGrace()], {closeExpiredSession: jest.fn(async () => false)})
        const releaseInstance = jest.fn(async () => {})
        const emitWorkerSessionClosed = jest.fn()
        const sendEmail = jest.fn()
        await run(repo, {releaseInstance, emitWorkerSessionClosed, sendEmail})
        expect(releaseInstance).not.toHaveBeenCalled()
        expect(emitWorkerSessionClosed).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
    })

    test('the row close commits before the instance is released', async () => {
        const order = []
        const repo = makeRepo([expiredPastGrace()], {
            closeExpiredSession: jest.fn(async () => { order.push('close'); return true }),
        })
        await run(repo, {releaseInstance: jest.fn(async () => { order.push('release') })})
        expect(order).toEqual(['close', 'release'])
    })
})

describe('notify mode', () => {
    const expiredPastGrace = session({notificationState: 'EMAILED', notifiedTime: minutesAgo(61)})

    test('counts what it would have done and closes nothing', async () => {
        const repo = makeRepo([expiredPastGrace])
        const metrics = {wouldHaveClosed: jest.fn()}
        const releaseInstance = jest.fn(async () => {})
        await run(repo, {mode: 'notify', metrics, releaseInstance})
        expect(metrics.wouldHaveClosed).toHaveBeenCalledTimes(1)
        expect(repo.closeExpiredSession).not.toHaveBeenCalled()
        expect(releaseInstance).not.toHaveBeenCalled()
    })

    // Sessions must not sit in EMAILED for as long as they are expired: switching production from
    // notify to enforce would otherwise close every accumulated session on the first sweep — the
    // worst possible first impression, delivered to the users who already ignored a warning.
    test('restarts the cycle rather than accumulating state', async () => {
        const repo = makeRepo([expiredPastGrace])
        await run(repo, {mode: 'notify', metrics: {wouldHaveClosed: jest.fn()}})
        expect(repo.restartExpiryCycle).toHaveBeenCalledWith('s-1', minutesAgo(61), 60)
    })

    test('still notifies and still emails', async () => {
        const repo = makeRepo([session()])
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {mode: 'notify', emitSessionExpiryNotified})
        expect(emitSessionExpiryNotified).toHaveBeenCalledTimes(1)
    })
})

describe('off mode and the startup grace', () => {
    test('off does not even look at the sessions', async () => {
        const repo = makeRepo([session()])
        await run(repo, {mode: 'off'})
        expect(repo.expiredSessions).not.toHaveBeenCalled()
    })

    // A stored deadline survives an outage, but the SENDERS of extension events cannot reach a
    // down worker, so they need wall-clock time to re-assert.
    test('within the startup grace the sweep is inert', async () => {
        const repo = makeRepo([session()])
        await run(repo, {startTime: new Date(NOW.getTime() - 30_000), startupGraceMs: 120_000})
        expect(repo.expiredSessions).not.toHaveBeenCalled()
    })

    test('after the startup grace it runs', async () => {
        const repo = makeRepo([session()])
        await run(repo, {startTime: new Date(NOW.getTime() - 180_000), startupGraceMs: 120_000})
        expect(repo.expiredSessions).toHaveBeenCalled()
    })
})

describe('isolation', () => {
    test('a failing session does not stop the next one', async () => {
        const repo = makeRepo([session({id: 's-1'}), session({id: 's-2'})], {
            notifyExpiry: jest.fn(async id => {
                if (id === 's-1') {
                    throw new Error('boom')
                }
                return true
            }),
        })
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {emitSessionExpiryNotified})
        expect(emitSessionExpiryNotified).toHaveBeenCalledTimes(1)
        expect(emitSessionExpiryNotified.mock.calls[0][0].session.id).toBe('s-2')
    })

    test('each session advances at most one state per tick', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(61)})])
        await run(repo)
        expect(repo.markEmailed).not.toHaveBeenCalled()
        expect(repo.closeExpiredSession).toHaveBeenCalledTimes(1)
    })
})

// ── what is running on the instance ──────────────────────────────────────────
// The notification names the instance the way the SSH menu does — "instance 2 (t3a.small)" — and
// says what is on it, so a user who has three instances open knows which one is about to go.
describe('describing the instance', () => {
    const withApps = apps => ({
        appRepo: {appsForSessions: jest.fn(async ids => new Map(ids.map(id => [id, apps])))},
    })

    test('the notify event carries the apps, the terminal count and the ordinal', async () => {
        const repo = makeRepo([session()])
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {
            ...withApps([{path: '/sandbox/rstudio', label: 'RStudio'}]),
            terminals: {get: () => 2},
            emitSessionExpiryNotified,
        })
        expect(emitSessionExpiryNotified).toHaveBeenCalledWith(expect.objectContaining({
            apps: [{path: '/sandbox/rstudio', label: 'RStudio'}],
            terminals: 2,
            ordinal: 1,
            instanceName: 't3a.small',
        }))
    })

    // The ordinal is the 1-based position in the owner's open sandbox sessions, the same list and
    // order interactive.js numbers, so "instance 2" means the same thing in both places.
    test('the ordinal is the position among the owner\'s open sessions', async () => {
        const target = session({id: 's-2'})
        const repo = makeRepo([target], {
            userSessions: jest.fn(async () => [{id: 's-1'}, {id: 's-2'}, {id: 's-3'}]),
        })
        const emitSessionExpiryNotified = jest.fn()
        await run(repo, {emitSessionExpiryNotified})
        expect(emitSessionExpiryNotified.mock.calls[0][0].ordinal).toBe(2)
    })

    test('the warning email says what is running', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const sendEmail = jest.fn()
        await run(repo, {
            ...withApps([{path: '/sandbox/rstudio', label: 'RStudio'}]),
            terminals: {get: () => 1},
            sendEmail,
        })
        const {content} = sendEmail.mock.calls[0][0]
        expect(content).toContain('instance 1 (t3a.small)')
        expect(content).toContain('RStudio and a terminal session')
    })

    // The close cascade deletes the app associations, so a description read after the close would
    // always say "nothing" — it has to be captured before.
    test('the close event still knows what it closed', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(61)})])
        const emitSessionExpiryClosed = jest.fn()
        await run(repo, {
            ...withApps([{path: '/sandbox/jupyter', label: 'Jupyter'}]),
            terminals: {get: () => 1},
            emitSessionExpiryClosed,
        })
        expect(emitSessionExpiryClosed).toHaveBeenCalledWith(expect.objectContaining({
            apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}],
            terminals: 1,
        }))
    })

    test('one terminal reads as "a terminal session", two as a count', async () => {
        const oneRepo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const oneEmail = jest.fn()
        await run(oneRepo, {terminals: {get: () => 1}, sendEmail: oneEmail})
        expect(oneEmail.mock.calls[0][0].content).toContain('a terminal session')

        const twoRepo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const twoEmail = jest.fn()
        await run(twoRepo, {terminals: {get: () => 2}, sendEmail: twoEmail})
        expect(twoEmail.mock.calls[0][0].content).toContain('2 terminal sessions')
    })

    test('an instance with nothing on it says so by saying nothing', async () => {
        const repo = makeRepo([session({notificationState: 'NOTIFIED', notifiedTime: minutesAgo(6)})])
        const sendEmail = jest.fn()
        await run(repo, {sendEmail})
        expect(sendEmail.mock.calls[0][0].content).not.toContain('terminal session')
        expect(sendEmail.mock.calls[0][0].content).not.toContain('running on it')
    })
})
