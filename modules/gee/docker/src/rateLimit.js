const {BehaviorSubject, timer} = require('rxjs')
const {mergeMap, map, take, filter} = require('rxjs/operators')

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

module.exports = rateLimit
