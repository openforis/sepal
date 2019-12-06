const {BehaviorSubject, ReplaySubject, of} = require('rxjs')
const {first, switchMap, filter, finalize} = require('rxjs/operators')
const log = require('../log')

//     get: {get: <namespace>} => <token>
// release: {release: <token>} => null

const TOKEN_COUNT = 3

const tokens$ = new BehaviorSubject(TOKEN_COUNT)

const availableTokens$ = tokens$.pipe(
    filter(tokens => tokens > 0)
)

const tokenOut$ = tokens => {
    tokens$.next(tokens - 1)
    return of(true)
}

const tokenIn$ = tokens => {
    tokens$.next(tokens + 1)
    return of(true)
}

const getToken$ = namespace => {
    log.warn('requesting token', namespace)
    const token$ = new ReplaySubject()

    availableTokens$.pipe(
        first(),
        switchMap(tokens => tokenOut$(tokens))
    ).subscribe(() => {
        token$.next(true)
        log.warn('HERE')
    })

    return token$.pipe(
        finalize(() => log.error('FINALIZED'))
    )
}

const releaseToken$ = token => {
    log.warn('returning token', token)
    return tokens$.pipe(
        first(),
        switchMap(tokens => tokenIn$(tokens))
    )
}

const handle$ = (requestId, message) => {
    if (message.get) {
        return getToken$(message.get)
    }
    if (message.release) {
        return releaseToken$(message.release)
    }
}

module.exports = {handle$}
