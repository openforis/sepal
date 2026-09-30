import {jest} from '@jest/globals'
import {defer, of, Subject} from 'rxjs'

// Who an abandoned export is cancelled as. Cleanup starts on unsubscription, which is decided outside the
// request, so it has to carry the identity of the request that started the export.

const calls = []
let start$
let currentContext

const eeCall = (operation, result$) => defer(() => {
    calls.push({operation, username: currentContext().username})
    return result$
})

jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        batch: {Export: {table: {toDrive: () => ({})}}},
        startTableExport$: () => eeCall('start', start$),
        getTaskStatus$: () => eeCall('status', of({state: 'RUNNING'})),
        cancelTask$: () => eeCall('cancel', of(undefined))
    }
}))

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
})

test('an export abandoned while it runs is cancelled as the user who started it', () => {
    start$ = of('T1')
    const subscription = inEEContext(ALICE, exportTableToDrive$({collection: {}, description: 'probe'})).subscribe({error: () => {}})

    subscription.unsubscribe()

    expect(calls).toEqual([
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

    expect(calls).toEqual([
        {operation: 'start', username: 'alice'},
        {operation: 'status', username: 'alice'},
        {operation: 'cancel', username: 'alice'}
    ])
})
