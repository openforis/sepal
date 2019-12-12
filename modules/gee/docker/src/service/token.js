const {BehaviorSubject, ReplaySubject, of} = require('rxjs')
const {first, switchMap, filter, map} = require('rxjs/operators')
const log = require('../log')

const TOKENS = {
    test: 10,
    default: 10
}

const tokens$ = new BehaviorSubject(TOKENS)

const availableTokens$ = bucket => tokens$.pipe(
    filter(tokens => tokens[bucket] > 0)
)

const updateBucket = (tokens, bucket, update) => {
    bucket = tokens[bucket] ? bucket : 'default'
    tokens$.next({...tokens, [bucket]: update(tokens[bucket])})
}

const tokenOut$ = (tokens, bucket) => {
    updateBucket(tokens, bucket, count => count - 1)
    return of(true)
}

const tokenIn$ = (tokens, bucket) => {
    updateBucket(tokens, bucket, count => count + 1)
    return of(true)
}

const getToken$ = (requestId, bucket) => {
    log.trace(`Token requested for bucket [${bucket}]`)
    const token$ = new ReplaySubject()

    availableTokens$(bucket).pipe(
        first(),
        switchMap(tokens => tokenOut$(tokens, bucket))
    ).subscribe(() => {
        token$.next({bucket})
    })

    return token$.pipe(
        map(value => ({requestId, value}))
    )
}

const releaseToken$ = (requestId, {bucket}) => {
    log.trace(`Token returned for bucket [${bucket}]`)
    return tokens$.pipe(
        first(),
        switchMap(tokens => tokenIn$(tokens, bucket))
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
