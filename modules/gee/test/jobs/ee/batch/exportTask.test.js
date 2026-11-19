import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {defer, of, Subject} from 'rxjs'
import {TestScheduler} from 'rxjs/testing'

// Who an abandoned export is cancelled as. Cleanup starts on unsubscription, which is decided outside the
// request, so it has to carry the identity of the request that started the export.

const calls = []
let start$
let currentContext
const getTaskStatus$ = mock.fn()

const eeCall = (operation, result$) => defer(() => {
    calls.push({operation, username: currentContext().username})
    return result$
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            batch: {Export: {table: {toDrive: () => ({})}}},
            startTableExport$: () => eeCall('start', start$),
            getTaskStatus$,
            cancelTask$: () => eeCall('cancel', of(undefined))
        }
    }
})

const {currentEEContext, inEEContext} = await import('#sepal/ee/eeContext')
currentContext = currentEEContext
const {exportTableToDrive$} = await import('#gee/jobs/ee/batch/exportTask')

const ALICE = {
    requestId: 'request-1',
    username: 'alice',
    auth: {type: 'serviceAccount'},
    projectId: 'sepal-test-project',
    workloadTag: 'sepal-work-test',
    endpoint: 'https://earthengine.googleapis.com'
}

beforeEach(() => {
    calls.length = 0
    getTaskStatus$.mock.resetCalls()
    getTaskStatus$.mock.mockImplementation(() => eeCall('status', of({state: 'RUNNING'})))
})

test('slow status checks finish without overlap and polling continues until completion', () => {
    start$ = of('T1')
    const scheduler = new TestScheduler((actual, expected) => assert.deepEqual(actual, expected))
    scheduler.run(({cold, expectObservable, expectSubscriptions}) => {
        const running$ = cold('2500ms (s|)', {s: {state: 'RUNNING'}})
        const completed$ = cold('2500ms (s|)', {s: {state: 'COMPLETED'}})
        getTaskStatus$.mock.mockImplementation(() => completed$)
        getTaskStatus$.mock.mockImplementationOnce(() => running$, 0)

        const result$ = inEEContext(ALICE, exportTableToDrive$({collection: {}, description: 'probe'}))

        expectObservable(result$, '10s !').toBe('8500ms (s|)', {s: {state: 'COMPLETED'}})
        expectSubscriptions(running$.subscriptions).toBe('2s ^ 2499ms !')
        expectSubscriptions(completed$.subscriptions).toBe('6s ^ 2499ms !')
    })
    assert.equal(getTaskStatus$.mock.callCount(), 2)
    assert.equal(calls.some(({operation}) => operation === 'cancel'), false)
})

test('cancelling during a slow status check stops polling and cleans up the export', () => {
    start$ = of('T1')
    const scheduler = new TestScheduler((actual, expected) => assert.deepEqual(actual, expected))
    scheduler.run(({cold, expectObservable, expectSubscriptions}) => {
        const status$ = cold('10s (s|)', {s: {state: 'RUNNING'}})
        getTaskStatus$.mock.mockImplementationOnce(() => status$, 0)

        const result$ = inEEContext(ALICE, exportTableToDrive$({collection: {}, description: 'probe'}))

        expectObservable(result$, '3500ms !').toBe('')
        expectSubscriptions(status$.subscriptions).toBe('2s ^ 1499ms !')
    })
    assert.equal(getTaskStatus$.mock.callCount(), 2)
    assert.deepEqual(calls, [
        {operation: 'start', username: 'alice'},
        {operation: 'status', username: 'alice'},
        {operation: 'cancel', username: 'alice'}
    ])
})

test('an export abandoned while it runs is cancelled as the user who started it', () => {
    start$ = of('T1')
    const subscription = inEEContext(ALICE, exportTableToDrive$({collection: {}, description: 'probe'})).subscribe({error: () => {}})

    subscription.unsubscribe()

    assert.deepEqual(calls, [
        {operation: 'start', username: 'alice'},
        {operation: 'status', username: 'alice'},
        {operation: 'cancel', username: 'alice'}
    ])
})

test('an export whose id arrives after it was abandoned is cancelled as the user who started it', () => {
    start$ = new Subject()
    const subscription = inEEContext(ALICE, exportTableToDrive$({collection: {}, description: 'probe'})).subscribe({error: () => {}})
    subscription.unsubscribe()

    start$.next('T2')

    assert.deepEqual(calls, [
        {operation: 'start', username: 'alice'},
        {operation: 'status', username: 'alice'},
        {operation: 'cancel', username: 'alice'}
    ])
})
