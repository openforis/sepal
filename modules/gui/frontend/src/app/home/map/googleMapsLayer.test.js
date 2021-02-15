import {PrioritizingTileProvider, TileProvider} from './googleMapsLayer'
import {Subject, concat, defer, isObservable, of} from 'rxjs'
import {finalize, first} from 'rxjs/operators'

test('With fewer than max concurrent requests, a request is immediately executed',
    done => {
        const provider = tileProvider(1)
        const request = new CompletingRequest('request')

        concat(
            when(
                () => provider.loadTile$(request),
                () => request.become('ACTIVE', 'COMPLETED')
            )
        ).subscribe({
            complete: () => done()
        })
    }
)

test('With max concurrent requests, a request is only executed after an active completes',
    done => {
        const provider = tileProvider(1)
        const request1 = new BlockingRequest('request1')
        const request2 = new CompletingRequest('request2')

        concat(
            when(
                () => provider.loadTile$(request1),
                () => request1.become('ACTIVE')
            ),
            execute(() => provider.loadTile$(request2)),
            // when(() => request1.complete(), () => request2.become('ACTIVE', 'COMPLETED'))
        ).subscribe({
            complete: () => done()
        })
    }
)

test('With max concurrent requests, a visible request is immediately executed, and a hidden active is canceled',
    done => {
        const provider1 = tileProvider(2)
        const request1 = new BlockingRequest('request1')
        const request2 = new BlockingRequest('request2')
        const provider2 = tileProvider(2)
        const request3 = new BlockingRequest('request3')

        concat(
            when(
                () => provider1.loadTile$(request1),
                () => request1.become('ACTIVE')
            ),
            when(
                () => provider1.loadTile$(request2),
                () => request2.become('ACTIVE')
            ),
            when(
                () => provider2.loadTile$(request3),
                () => {
                    request3.become('ACTIVE')
                    request2.become('CANCELED')
                }
            ),
            execute(() => {
                request1.assertState('ACTIVE')
                request2.assertState('CANCELED')
                request3.assertState('ACTIVE')
            })
        ).subscribe({
            complete: () => done()
        })
    }
)

class FakeTileProvider extends TileProvider {
    constructor(concurrency) {
        super()
        this.concurrency = concurrency
        this.type = `FakeTileProvider-${Math.random()}`
    }

    getType() {
        return this.type
    }

    getConcurrency() {
        return this.concurrency
    }

    loadTile$(tileRequest) {
        return tileRequest.execute$()
    }
}

const tileProvider = concurrency => new PrioritizingTileProvider(
    new FakeTileProvider(concurrency)
)

class FakeTileRequest {
    state = 'PENDING'
    state$ = new Subject()

    constructor(requestId) {
        this.requestId = requestId
        this.setState('PENDING')
    }

    execute$() {
        throw Error('execute$() is expected to be overridden by subclass.')
    }

    setState(state) {
        this.state = state
        this.state$.next(state)
    }

    become(...states) {
        const changes = []
        const done$ = new Subject()
        this.state$.subscribe({
            next: next => {
                expect(changes.length, `Unexpected request state: ${next}. Already got all expected states: ${states}`).toBeLessThan(states.length)
                if (changes.length < states.length) {
                    expect(next, `Unexpected request state: ${next}. Expected ${states[changes.length]}`).toEqual(states[changes.length])
                }
                changes.push(next)
                if (changes.length === states.length) {
                    done$.next()
                    done$.complete()
                }
            }
        })
        return done$
    }

    assertState(state) {
        expect(this.state).toEqual(state)
    }
}

class BlockingRequest extends FakeTileRequest {
    complete$ = new Subject()

    constructor(requestId) {
        super(requestId)
    }

    execute$() {
        this.setState('ACTIVE')
        return this.complete$.pipe(
            first(),
            finalize(() => {
                console.log('finalize', this.isCompleted)
                return this.isCompleted || this.setState('CANCELED')
            })
        )
    }

    complete() {
        this.isCompleted = true
        this.complete$.next(this)
    }
}

class CompletingRequest extends FakeTileRequest {
    constructor(requestId) {
        super(requestId)
    }

    execute$() {
        this.setState('ACTIVE')
        this.setState('COMPLETED')
        return defer(() => of(this))
    }
}

const execute = fn =>
    defer(() => {
        const result = fn()
        if (isObservable(result)) {
            result.subscribe()
        }
        return of(result)
    })

const when = (operationFn, thenFn) =>
    defer(() => {
        const callbackResult = thenFn()
        const operationResult = operationFn()
        isObservable(operationResult) && operationResult.subscribe()
        return of(callbackResult)
    })
