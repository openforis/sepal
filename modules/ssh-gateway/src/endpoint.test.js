import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it, mock} from 'node:test'

import {of, throwError} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

const post$ = mock.fn()
const get$ = mock.fn()

mock.module('#sepal/httpClient', {
    exports: {
        get$,
        post$,
        delete$: mock.fn()
    }
})

mock.module('./config.js', {
    exports: {
        endpoint: 'http://worker/',
        endpointPassword: 'pw',
        username: 'admin'
    }
})

const {createSession$, joinSession$, sandboxInfo$, sessionLabel$} = await import('./endpoint.js')

const session = {id: 's-1', path: 'sessions/admin/session/s-1', status: 'STARTING'}

beforeEach(() => {
    post$.mock.resetCalls()
    post$.mock.mockImplementation(() => undefined)
    get$.mock.resetCalls()
    get$.mock.mockImplementation(() => undefined)
    mock.timers.enable()
})

afterEach(() => mock.timers.reset())

describe('sandboxInfo$', () => {
    // The worker report does not carry spending — the budget module owns it and pushes it over its
    // websocket for the GUI — so the menu fetches it from the budget module directly.
    it('merges spending from the budget module into the report', () => {
        // bodies arrive parsed — these calls ask for responseType: 'json'
        get$.mock.mockImplementation(url => url.includes('/report')
            ? of({statusCode: 200, body: {sessions: [], instanceTypes: [{tag: 't1'}]}})
            : of({statusCode: 200, body: {
                monthlyInstanceSpending: 1, monthlyInstanceBudget: 10,
                monthlyStorageSpending: 0, monthlyStorageBudget: 10,
                storageUsed: 0, storageQuota: 100
            }}))
        const results = []
        sandboxInfo$().subscribe(result => results.push(result))
        assert.equal(get$.mock.callCount(), 2)
        assert.equal(callsOf(get$).some(([url]) => url.includes('budget/spending/admin')), true)
        assert.equal(results[0].spending.monthlyInstanceBudget, 10)
        assert.deepEqual(results[0].instanceTypes, [{tag: 't1'}])
        assert.equal(results[0].exceededBudget, false)
    })
})

// The label names the GUI terminal tab. It is read from the report rather than assembled here so
// that the number is exactly the ID the menu just showed, for a joined session and for one the user
// has only now created — which has no place in the list until the report lists it.
describe('sessionLabel$', () => {
    const report = sessions => of({statusCode: 200, body: {sessions, instanceTypes: []}})

    it('is the session\'s menu ID and name', () => {
        get$.mock.mockImplementation(() => report([
            {id: 's-0', name: 'bold-otter'},
            {id: 's-1', name: 'lazy-paper'}
        ]))
        const results = []
        sessionLabel$(session).subscribe(result => results.push(result))
        assert.deepEqual(results, ['2: lazy-paper'])
    })

    // Nothing downstream can act on a missing label, and a wrong one would leave the user's tab
    // named after somebody else's session — so both failures resolve to "no label".
    it('has no label for a session missing from the report', () => {
        get$.mock.mockImplementation(() => report([{id: 's-other', name: 'bold-otter'}]))
        const results = []
        sessionLabel$(session).subscribe(result => results.push(result))
        assert.deepEqual(results, [null])
    })

    it('has no label when the report cannot be fetched', () => {
        get$.mock.mockImplementation(() => throwError(() => new Error('worker down')))
        const results = []
        sessionLabel$(session).subscribe(result => results.push(result))
        assert.deepEqual(results, [null])
    })
})

describe('joinSession$', () => {
    it('polls until the session leaves STARTING', () => {
        post$.mock.mockImplementationOnce(() => of({statusCode: 200, body: {...session, status: 'STARTING'}}), 0)
        post$.mock.mockImplementationOnce(() => of({statusCode: 200, body: {...session, status: 'ACTIVE'}}), 1)
        const results = []
        joinSession$(session).subscribe(result => results.push(result))
        mock.timers.tick(2000)
        assert.deepEqual(results.map(({status}) => status), ['ACTIVE'])
    })

    it('emits the unavailable sentinel when the session disappears mid-start (404)', () => {
        post$.mock.mockImplementation(() => of({statusCode: 404, body: {message: 'Session not open: s-1'}}))
        const results = []
        joinSession$(session).subscribe(result => results.push(result))
        mock.timers.tick(1000)
        assert.deepEqual(results, [{unavailable: true, reason: 'FAILED'}]) // cause unknown — generic message
        const [, options] = post$.mock.calls[0].arguments
        assert.ok(options.validStatuses.includes(404)) // 404 must arrive as a response, not an error
        assert.equal(options.responseType, 'json')
    })
})

describe('createSession$', () => {
    it('maps a classified 503 (AZ capacity) to the INSTANCE_UNAVAILABLE reason, without retrying', () => {
        post$.mock.mockImplementation(() => of({
            statusCode: 503,
            body: {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'}
        }))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        assert.deepEqual(results, [{unavailable: true, reason: 'INSTANCE_UNAVAILABLE'}])
        const [, options] = post$.mock.calls[0].arguments
        assert.ok(options.validStatuses.includes(503)) // a response, not an error — httpClient must not retry it
        assert.equal(options.responseType, 'json')
    })

    it('maps a classified 503 (account quota) to the QUOTA_EXCEEDED reason', () => {
        post$.mock.mockImplementation(() => of({
            statusCode: 503,
            body: {code: 'QUOTA_EXCEEDED', message: 'vCPU limit exceeded.'}
        }))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        assert.deepEqual(results, [{unavailable: true, reason: 'QUOTA_EXCEEDED'}])
    })

    // failureReason sees two body shapes: a response body, parsed by responseType 'json', and a
    // thrown error's body, which httpClient always leaves as raw text. Both must yield the code.
    it('reads the reason from a thrown error, whose body stays raw text', () => {
        post$.mock.mockImplementation(() => throwError(() => Object.assign(new Error('boom'), {
            statusCode: 503,
            body: '{"code":"QUOTA_EXCEEDED","message":"vCPU limit exceeded."}'
        })))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        assert.deepEqual(results, [{unavailable: true, reason: 'QUOTA_EXCEEDED'}])
    })

    it('falls back to FAILED when an error body is not json', () => {
        post$.mock.mockImplementation(() => throwError(() => Object.assign(new Error('boom'), {
            statusCode: 502,
            body: '<html>bad gateway</html>'
        })))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        assert.deepEqual(results, [{unavailable: true, reason: 'FAILED'}])
    })

    it('maps any other create failure to the FAILED reason', () => {
        post$.mock.mockImplementation(
            () => throwError(() => Object.assign(new Error('boom'), {statusCode: 500}))
        )
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        assert.deepEqual(results, [{unavailable: true, reason: 'FAILED'}])
    })

    it('polls the created session until it starts', () => {
        post$.mock.mockImplementationOnce(() => of({statusCode: 201, body: session}), 0)
        post$.mock.mockImplementationOnce(() => of({statusCode: 200, body: {...session, status: 'ACTIVE'}}), 1)
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        mock.timers.tick(1000)
        assert.deepEqual(results.map(({status}) => status), ['ACTIVE'])
    })
})
