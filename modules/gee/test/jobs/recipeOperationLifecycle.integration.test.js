import {createServer} from 'http'
import {dirname, join} from 'path'
import {filter, firstValueFrom, ReplaySubject, Subscription} from 'rxjs'
import {fileURLToPath} from 'url'

// Whether an operation is really released when a request ends, through the worker the module runs its
// jobs on: a real worker thread, the real job task list and a real recipe endpoint. The job leaves a
// read in flight, and the endpoint sees whether that read is torn down when the request completes,
// fails or is cancelled.

const ALICE = {username: 'alice', roles: []}
const JOB_NAME = 'test recipe lifecycle'
const JOB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'support', 'recipeLifecycleJob.js')

const PENDING_RECIPE = 'never-answered'
const GATE_RECIPE = 'gate'

// The module configures itself from the worker thread's own environment, which is not the one this file
// can assign to: the runner hands a test file its own copy of process.env, and a worker thread inherits
// the real process. So the configuration the worker runs under is stated here and passed to it.
const WORKER_ENV = {
    SEPAL_ENDPOINT: 'http://sepal.test',
    GOOGLE_PROJECT_ID: 'test-project',
    EE_ACCOUNT: 'test@example.iam.gserviceaccount.com',
    EE_PRIVATE_KEY: 'test-key'
}

const held = new Map()
const waitingFor = new Map()

let recipeServer
let worker
let submit$

beforeAll(async () => {
    recipeServer = await startRecipeEndpoint()
    const recipeEndpoint = `http://127.0.0.1:${recipeServer.address().port}`

    const {configureNoLogging} = await import('#sepal/log')
    configureNoLogging()

    // The worker's own half of the context service is real; this is the main thread's answer to it,
    // which cannot be the module's own - that parses process arguments, which under a test runner
    // are the runner's.
    const {of} = await import('rxjs')
    const {addServices} = await import('#sepal/service/registry')
    addServices([{
        serviceName: 'ContextService',
        serviceHandler$: () => of({recipeEndpoint})
    }])

    const {initWorker$} = await import('#sepal/worker/factory')
    worker = new Subscription()
    submit$ = await new Promise(resolve =>
        worker.add(initWorker$({workerId: 'lifecycle', env: WORKER_ENV}).subscribe(resolve)))
}, 60000)

afterAll(() => {
    worker?.unsubscribe()
    return new Promise(resolve => recipeServer.close(resolve))
})

beforeEach(() => {
    held.clear()
    waitingFor.clear()
})

describe('the operation of a request', () => {
    test.each([
        ['completes', 'complete'],
        ['fails', 'fail'],
        ['is cancelled', 'cancel'],
    ])('releases the read it still had in flight when the request %s', async (_case, ending) => {
        const pending = await runJob(ending)

        await untilAborted(pending)
        expect(pending.aborted).toBe(true)
    }, 20000)
})

// The request as the scheduler submits it: one args entry per task of the list, configure first.
const runJob = async ending => {
    const response$ = submit$({
        jobName: JOB_NAME,
        jobPath: JOB_PATH,
        requestId: `request-${ending}`,
        requestTag: `<request-${ending}>`,
        args: [
            {credentials: {sepalUser: ALICE}},
            {requestArgs: {pendingRecipeId: PENDING_RECIPE, gateRecipeId: GATE_RECIPE, ending}}
        ],
        cancel$: new ReplaySubject(1)
    })
    const subscription = response$.subscribe({error: () => {}})

    const pending = await untilRequested(PENDING_RECIPE)
    const gate = await untilRequested(GATE_RECIPE)

    if (ending === 'cancel') {
        subscription.unsubscribe()
    } else {
        answer(gate)
        await firstValueFrom(response$.pipe(filter(({complete, error}) => complete || error)))
    }
    return pending
}

const untilRequested = id => held.get(id)
    ? Promise.resolve(held.get(id))
    : new Promise(resolve => waitingFor.set(id, resolve))

const untilAborted = pending => new Promise(resolve => {
    pending.aborted ? resolve() : pending.request.once('close', resolve)
})

const answer = ({response, id}) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({id, revision: 1}))
}

// Every read is held until a case answers it, so what a case observes is what the operation did and
// not how quickly an answer happened to arrive.
const startRecipeEndpoint = () => new Promise(resolve => {
    const server = createServer((request, response) => {
        const id = request.url.split('/').pop()
        const pending = {id, request, response, aborted: false}
        request.once('close', () => pending.aborted = true)
        held.set(id, pending)
        waitingFor.get(id)?.(pending)
        waitingFor.delete(id)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
})
