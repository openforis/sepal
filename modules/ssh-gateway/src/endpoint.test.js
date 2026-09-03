import {jest} from '@jest/globals'
import {of, throwError} from 'rxjs'

const post$ = jest.fn()
const get$ = jest.fn()

jest.unstable_mockModule('#sepal/httpClient', () => ({
    get$,
    post$,
    delete$: jest.fn()
}))

jest.unstable_mockModule('./config.js', () => ({
    endpoint: 'http://worker/',
    endpointPassword: 'pw',
    username: 'admin'
}))

const {createSession$, joinSession$, sandboxInfo$} = await import('./endpoint.js')

const session = {id: 's-1', path: 'sessions/admin/session/s-1', status: 'STARTING'}

beforeEach(() => {
    post$.mockReset()
    get$.mockReset()
    jest.useFakeTimers()
})

afterEach(() => jest.useRealTimers())

describe('sandboxInfo$', () => {
    // The worker report does not carry spending — the budget module owns it and pushes it over its
    // websocket for the GUI — so the menu fetches it from the budget module directly.
    it('merges spending from the budget module into the report', () => {
        // bodies arrive parsed — these calls ask for responseType: 'json'
        get$.mockImplementation(url => url.includes('/report')
            ? of({statusCode: 200, body: {sessions: [], instanceTypes: [{tag: 't1'}]}})
            : of({statusCode: 200, body: {
                monthlyInstanceSpending: 1, monthlyInstanceBudget: 10,
                monthlyStorageSpending: 0, monthlyStorageBudget: 10,
                storageUsed: 0, storageQuota: 100
            }}))
        const results = []
        sandboxInfo$().subscribe(result => results.push(result))
        expect(get$).toHaveBeenCalledTimes(2)
        expect(get$.mock.calls.some(([url]) => url.includes('budget/spending/admin'))).toBe(true)
        expect(results[0].spending.monthlyInstanceBudget).toBe(10)
        expect(results[0].instanceTypes).toEqual([{tag: 't1'}])
        expect(results[0].exceededBudget).toBe(false)
    })
})

describe('joinSession$', () => {
    it('polls until the session leaves STARTING', () => {
        post$
            .mockReturnValueOnce(of({statusCode: 200, body: {...session, status: 'STARTING'}}))
            .mockReturnValueOnce(of({statusCode: 200, body: {...session, status: 'ACTIVE'}}))
        const results = []
        joinSession$(session).subscribe(result => results.push(result))
        jest.advanceTimersByTime(2000)
        expect(results).toEqual([expect.objectContaining({status: 'ACTIVE'})])
    })

    it('emits the unavailable sentinel when the session disappears mid-start (404)', () => {
        post$.mockReturnValue(of({statusCode: 404, body: {message: 'Session not open: s-1'}}))
        const results = []
        joinSession$(session).subscribe(result => results.push(result))
        jest.advanceTimersByTime(1000)
        expect(results).toEqual([{unavailable: true, reason: 'FAILED'}]) // cause unknown — generic message
        const [, options] = post$.mock.calls[0]
        expect(options.validStatuses).toContain(404) // 404 must arrive as a response, not an error
        expect(options.responseType).toBe('json')
    })
})

describe('createSession$', () => {
    it('maps a classified 503 (AZ capacity) to the INSTANCE_UNAVAILABLE reason, without retrying', () => {
        post$.mockReturnValue(of({
            statusCode: 503,
            body: {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'}
        }))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        expect(results).toEqual([{unavailable: true, reason: 'INSTANCE_UNAVAILABLE'}])
        const [, options] = post$.mock.calls[0]
        expect(options.validStatuses).toContain(503) // a response, not an error — httpClient must not retry it
        expect(options.responseType).toBe('json')
    })

    it('maps a classified 503 (account quota) to the QUOTA_EXCEEDED reason', () => {
        post$.mockReturnValue(of({
            statusCode: 503,
            body: {code: 'QUOTA_EXCEEDED', message: 'vCPU limit exceeded.'}
        }))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        expect(results).toEqual([{unavailable: true, reason: 'QUOTA_EXCEEDED'}])
    })

    // failureReason sees two body shapes: a response body, parsed by responseType 'json', and a
    // thrown error's body, which httpClient always leaves as raw text. Both must yield the code.
    it('reads the reason from a thrown error, whose body stays raw text', () => {
        post$.mockReturnValue(throwError(() => Object.assign(new Error('boom'), {
            statusCode: 503,
            body: '{"code":"QUOTA_EXCEEDED","message":"vCPU limit exceeded."}'
        })))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        expect(results).toEqual([{unavailable: true, reason: 'QUOTA_EXCEEDED'}])
    })

    it('falls back to FAILED when an error body is not json', () => {
        post$.mockReturnValue(throwError(() => Object.assign(new Error('boom'), {
            statusCode: 502,
            body: '<html>bad gateway</html>'
        })))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        expect(results).toEqual([{unavailable: true, reason: 'FAILED'}])
    })

    it('maps any other create failure to the FAILED reason', () => {
        post$.mockReturnValue(throwError(() => Object.assign(new Error('boom'), {statusCode: 500})))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        expect(results).toEqual([{unavailable: true, reason: 'FAILED'}])
    })

    it('polls the created session until it starts', () => {
        post$
            .mockReturnValueOnce(of({statusCode: 201, body: session}))
            .mockReturnValueOnce(of({statusCode: 200, body: {...session, status: 'ACTIVE'}}))
        const results = []
        createSession$({path: 'sessions/admin/instance-type/T3aSmall'}).subscribe(result => results.push(result))
        jest.advanceTimersByTime(1000)
        expect(results).toEqual([expect.objectContaining({status: 'ACTIVE'})])
    })
})
