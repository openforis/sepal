const {Subject, BehaviorSubject, timer} = require('rxjs')
const {mergeMap, map, take, filter, tap} = require('rxjs/operators')

const COUNT = 3
const SLIDING_WINDOW_TIME = 1000

const rateLimit = (count, slidingWindowTime) => {
    let tokens = count

    const tokenCount$ = new BehaviorSubject(tokens)
    const availableTokens$ = tokenCount$.pipe(filter(() => tokens > 0))

    const useToken = () => {
        tokenCount$.next(--tokens)
        timer(slidingWindowTime).subscribe(
            () => tokenCount$.next(++tokens)
        )
    }

    return observable$ => observable$.pipe(
        mergeMap(value =>
            availableTokens$.pipe(
                take(1),
                map(() => {
                    useToken()
                    return value
                })
            )
        )
    )
}

const token$ = new Subject()
const rateLimitedToken$ = token$.pipe(
    rateLimit(COUNT, SLIDING_WINDOW_TIME),
    tap(token => console.log(`Dequeued token: ${token}`))
)

token$.subscribe(
    token => console.log(`Enqueued token: ${token}`)
)

module.exports = port => {
    const listener = message => {
        token$.next(message)
    }
    
    port.on('message', listener)
    const subscription = rateLimitedToken$.subscribe(
        message => port.postMessage(message)
    )
    return {
        cleanup: () => {
            subscription.unsubscribe()
            port.removeListener('message', listener)
        }
    }
}
