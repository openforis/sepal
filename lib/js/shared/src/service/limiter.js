const {Subject, finalize, mergeMap, takeUntil, switchMap, defer, of, tap} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {TokenLimiter} = require('#sepal/limiter/tokenLimiter')
const service = require('#sepal/service')
const {createGauge, createSummary} = require('#sepal/metrics')
const {tag} = require('#sepal/tag')
const log = require('#sepal/log').getLogger('limiter')

const limiterTag = (name, username) => tag('Limiter', name, username)

const MAX_AGE_SECONDS = 600
const AGE_BUCKETS = 6

const LimiterService = (name, options) => {

    const globalLimiter = options.global
        ? TokenLimiter({...options.global, name: `${name}:GLOBAL`})
        : null

    const metrics = {
        requestWaitTime: createSummary({
            name: `sepal_limiter_${name}_wait_time`,
            help: `SEPAL limiter ${name} wait time`,
            maxAgeSeconds: MAX_AGE_SECONDS,
            ageBuckets: AGE_BUCKETS
        }),
        tokens: createGauge({
            name: `sepal_limiter_${name}_tokens_total`,
            help: `SEPAL limiter ${name} pending tokens`,
            labelNames: ['username']
        })
    }

    const userLimiters = {}

    const addLimiter = username => {
        const tokenLimiterOptions = {...options, name: `${name}:${username}`}
        const onDispose = () => removeLimiter(username)
        const limiter = TokenLimiter(tokenLimiterOptions, onDispose)
        userLimiters[username] = limiter
        log.debug(() => `${limiterTag(name, username)} added`)
    }

    const removeLimiter = username => {
        delete userLimiters[username]
        log.debug(() => `${limiterTag(name, username)} removed`)
    }
    
    const getLimiter = username => {
        if (!userLimiters[username]) {
            addLimiter(username)
        }
        return userLimiters[username]
    }

    const limiterService = {
        serviceName: name,
        serviceHandler$: ({id, username}) => {
            const userLimiter = getLimiter(username)
            const endWaitTime = metrics.requestWaitTime.startTimer()
            metrics.tokens?.inc({username})
            return userLimiter.getToken$(id).pipe(
                switchMap(value => {
                    if (globalLimiter) {
                        metrics.tokens?.inc()
                        return globalLimiter.getToken$(id).pipe(
                            finalize(() => metrics.tokens?.dec())
                        )
                    } else {
                        return of(value)
                    }
                }),
                tap(() => endWaitTime()),
                finalize(() => metrics.tokens?.dec({username}))
            )
        }
    }

    return {
        limiterService,
        limiter$: (observable$, id = uuid(), username) =>
            defer(() => {
                const stop$ = new Subject()
                return service.submit$(limiterService, {id, username: username || 'ANON'}).pipe(
                    takeUntil(stop$),
                    mergeMap(() => observable$.pipe(
                        finalize(() => stop$.next())
                    ))
                )
            })
    }
}

module.exports = {LimiterService}
