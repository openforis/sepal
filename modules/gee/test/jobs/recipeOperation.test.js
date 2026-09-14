import {jest} from '@jest/globals'
import {defaultIfEmpty, EMPTY, firstValueFrom, forkJoin, Observable, of, Subject, switchMap, take} from 'rxjs'
import {MessageChannel} from 'worker_threads'

// What one execution operation reads, and for how long: the real configure task opens it on the
// request's state, the real job wrapper runs every later task inside it, and the real finalize task
// ends it. Only the transport under the module's own reader is substituted.

const RECIPE_ENDPOINT = 'http://recipe'

const ALICE = {username: 'alice', roles: []}
const BOB = {username: 'bob', roles: []}

const reads = []
const waitingForHeld = []

let catalogue
let held

jest.unstable_mockModule('#sepal/httpClient', () => ({
    get$: (url, options) => {
        const id = url.split('/').pop()
        const read = {id, sepalUser: JSON.parse(options.headers['sepal-user'])}
        reads.push(read)
        return new Observable(subscriber => {
            const answer = () => {
                const recipe = catalogue[id]
                recipe
                    ? (subscriber.next({body: recipe}), subscriber.complete())
                    : subscriber.error(Object.assign(new Error(`No such recipe: ${id}`), {statusCode: 404}))
            }
            held ? hold({read, answer}) : answer()
            return () => read.tornDown = true
        })
    }
}))

jest.unstable_mockModule('#gee/config', () => ({
    googleProjectId: 'test-project',
    instances: 1,
    port: 80,
    recipeEndpoint: RECIPE_ENDPOINT,
    sepalEndpoint: 'http://test',
    serviceAccountCredentials: {}
}))

jest.unstable_mockModule('#gee/jobs/service/context', () => ({
    contextService: {serviceName: 'ContextService', serviceHandler$: () => of({})},
    getContext$: () => of({recipeEndpoint: RECIPE_ENDPOINT})
}))

const {WORKER} = await import('#sepal/worker/factory')
const {loadRecipe$} = await import('#sepal/ee/recipe')
const {PortTransport} = await import('#sepal/rxjs/transport/port')
const service = await import('#sepal/service')
const {addServices} = await import('#sepal/service/registry')
const {job} = await import('#gee/jobs/job')
const {default: configureJob} = await import('#gee/jobs/configure')

// A service reached over a real MessagePort, the way Earth Engine's limiter is: its responses arrive
// on the transport's own message handler, which exists outside whatever submitted the request.
const ROUND_TRIP = 'RoundTrip'
const roundTripAnswer = new Subject()
const waitingForRoundTrip = []

addServices([{
    serviceName: ROUND_TRIP,
    serviceHandler$: () => {
        waitingForRoundTrip.splice(0).forEach(arrived => arrived())
        return roundTripAnswer.pipe(take(1))
    }
}])

// Both ends share one transport id, as a worker and its host do.
const TRANSPORT = 'test-worker'

const ports = new MessageChannel()
PortTransport({
    transportId: TRANSPORT,
    port: ports.port1,
    onChannel: ({conversationGroupId: serviceName, in$: response$, out$: request$}) =>
        serviceName && service.start(serviceName, request$, response$)
})
service.initialize(PortTransport({transportId: TRANSPORT, port: ports.port2, onChannel: () => {}}))

afterAll(() => {
    ports.port1.close()
    ports.port2.close()
})

// Jobs like any other in this module: they read recipes and know nothing about operations.
const readingJob = job({
    jobName: 'test read recipes',
    before: [],
    worker$: ({requestArgs: {ids}}) => forkJoin(ids.map(id => loadRecipe$(id)))
})

const roundTripJob = job({
    jobName: 'test read across a service round trip',
    before: [],
    worker$: ({requestArgs: {before, after}}) =>
        loadRecipe$(before).pipe(
            switchMap(() => service.submit$({serviceName: ROUND_TRIP}, 'ping').pipe(take(1))),
            switchMap(() => loadRecipe$(after))
        )
})

beforeEach(() => {
    reads.length = 0
    waitingForHeld.length = 0
    held = null
    catalogue = {
        'recipe-1': {id: 'recipe-1', revision: 1},
        'recipe-2': {id: 'recipe-2', revision: 1}
    }
})

describe('within one operation', () => {
    test('a recipe referenced repeatedly is read once and answered with one record', async () => {
        const operation = await start()

        const [first, second] = await operation.read(['recipe-1', 'recipe-1'])

        expect(first).toBe(second)
        expect(readIds()).toEqual(['recipe-1'])
    })

    test('a recipe referenced again later still gets the record already read', async () => {
        const operation = await start()

        const [first] = await operation.read(['recipe-1'])
        catalogue['recipe-1'] = {id: 'recipe-1', revision: 2}
        const [again] = await operation.read(['recipe-1'])

        expect(again).toBe(first)
        expect(readIds()).toEqual(['recipe-1'])
    })

    test('different recipes are read separately', async () => {
        const operation = await start()

        await operation.read(['recipe-1', 'recipe-2'])

        expect(readIds()).toEqual(['recipe-1', 'recipe-2'])
    })

    test('a refusal reaches the caller with the cause the reader gave', async () => {
        const operation = await start()

        await expect(operation.read(['no-such-recipe'])).rejects.toMatchObject({statusCode: 404})
    })

    // A failure is an outcome of one attempt, not a record of the operation.
    test('a failed read is not retained, so a later attempt reads again', async () => {
        const operation = await start()
        await expect(operation.read(['gone'])).rejects.toThrow()

        catalogue['gone'] = {id: 'gone', revision: 1}
        const [recipe] = await operation.read(['gone'])

        expect(recipe).toEqual({id: 'gone', revision: 1})
        expect(readIds()).toEqual(['gone', 'gone'])
    })
})

describe('across operations', () => {
    test('a later operation reads again and sees the newer revision', async () => {
        const first = await start()
        await first.read(['recipe-1'])
        await first.end()

        catalogue['recipe-1'] = {id: 'recipe-1', revision: 2}
        const second = await start()
        const [recipe] = await second.read(['recipe-1'])

        expect(recipe).toEqual({id: 'recipe-1', revision: 2})
        expect(readIds()).toEqual(['recipe-1', 'recipe-1'])
    })

    test('overlapping operations keep their own records and their own reader', async () => {
        const alices = await start({user: ALICE})
        const bobs = await start({user: BOB})

        const [alicesRecipe] = await alices.read(['recipe-1'])
        catalogue['recipe-1'] = {id: 'recipe-1', revision: 2}
        const [bobsRecipe] = await bobs.read(['recipe-1'])

        expect(alicesRecipe.revision).toBe(1)
        expect(bobsRecipe.revision).toBe(2)
        expect(readers()).toEqual([ALICE, BOB])
    })

})

describe('across a service round trip', () => {
    // A response resumes execution on the transport's own handler. The operation has to survive that,
    // or the read after it has no reader at all.
    test('a read after the round trip is still made in the same operation', async () => {
        const operation = await start()
        const reading = operation.readAcross('recipe-1', 'recipe-2')
        await untilRoundTrip()

        answerRoundTrip()

        await expect(reading).resolves.toEqual({id: 'recipe-2', revision: 1})
        expect(readIds()).toEqual(['recipe-1', 'recipe-2'])
    })

    // The read is ISSUED after the later operation started, so which reader it uses is decided then.
    test('a read issued after a later operation started is still made as its own user', async () => {
        const alices = await start({user: ALICE})
        const reading = alices.readAcross('recipe-1', 'recipe-2')
        await untilRoundTrip()

        await start({user: BOB})
        answerRoundTrip()

        await reading
        expect(readers()).toEqual([ALICE, ALICE])
    })
})

describe('ending an operation', () => {
    test('refuses further reads rather than reading with another operation\'s authority', async () => {
        const operation = await start()
        await operation.end()

        await expect(operation.read(['recipe-1'])).rejects.toThrow(/Operation ended/)
        expect(reads).toEqual([])
    })

    test('tears down a read still in flight', async () => {
        held = []
        const operation = await start()
        const reading = operation.read(['recipe-1'])
        reading.catch(() => {})
        await untilHeld(1)

        await operation.end()

        expect(held[0].read.tornDown).toBe(true)
    })
})

test('a job running outside any operation reads nothing and says so', async () => {
    const [{worker$}] = readingJob(WORKER)

    await expect(firstValueFrom(worker$({requestArgs: {ids: ['recipe-1']}, state: {}})))
        .rejects.toThrow(/No execution operation in progress/)
    expect(reads).toEqual([])
})

const readIds = () => reads.map(({id}) => id)
const readers = () => reads.map(({sepalUser}) => sepalUser)

// The tasks of one request, run the way the worker runs them: one state, shared by all of them.
const start = async ({user = ALICE} = {}) => {
    const state = {}
    const [configure] = configureJob(WORKER)
    const [reading] = readingJob(WORKER)
    const [roundTrip] = roundTripJob(WORKER)
    await firstValueFrom(
        configure.worker$({credentials: {sepalUser: user}, state}).pipe(defaultIfEmpty(null))
    )
    return {
        read: ids => firstValueFrom(reading.worker$({requestArgs: {ids}, state})),
        readAcross: (before, after) =>
            firstValueFrom(roundTrip.worker$({requestArgs: {before, after}, state})),
        end: () => firstValueFrom((configure.finalize$ ?? (() => EMPTY))({state}).pipe(defaultIfEmpty(null)))
    }
}

// Gates on the reads themselves, so the cases below decide when an answer arrives.
const hold = entry => {
    held.push(entry)
    waitingForHeld.splice(0).filter(waiter => !waiter()).forEach(waiter => waitingForHeld.push(waiter))
}

const untilHeld = count => new Promise(resolve => {
    const reached = () => held.length >= count && (resolve(), true)
    reached() || waitingForHeld.push(reached)
})

const untilRoundTrip = () => new Promise(arrived => waitingForRoundTrip.push(arrived))

const answerRoundTrip = () => roundTripAnswer.next('pong')
