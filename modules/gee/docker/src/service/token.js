const {BehaviorSubject, ReplaySubject, of} = require('rxjs')
const {first, switchMap, filter, finalize, map, tap} = require('rxjs/operators')
const log = require('../log')

//     get: {get: <namespace>} => <token>
// release: {release: <token>} => null

const TOKEN_COUNT = 10

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

const getToken$ = (requestId, namespace) => {
    log.warn('requesting token', namespace)
    const token$ = new ReplaySubject()

    availableTokens$.pipe(
        first(),
        switchMap(tokens => tokenOut$(tokens))
    ).subscribe(() => {
        token$.next({token: true})
    })

    return token$.pipe(
        map(value => ({requestId, value})),
        finalize(() => log.error('FINALIZED'))
    )
}

const releaseToken$ = (requestId, token) => {
    log.warn('returning token', token)
    return tokens$.pipe(
        first(),
        switchMap(tokens => tokenIn$(tokens))
    )
}

const handle$ = (requestId, message) => {
    if (message.get) {
        return getToken$(requestId, message.get)
    }
    if (message.release) {
        return releaseToken$(requestId, message.release)
    }
}

module.exports = {handle$}
