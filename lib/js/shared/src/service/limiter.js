import {defer, finalize, mergeMap, of, Subject, switchMap, takeUntil, tap} from 'rxjs'
import {v4 as uuid} from 'uuid'

import {TokenLimiter} from '#sepal/limiter/tokenLimiter'
import {getLogger} from '#sepal/log'
import {createGauge, createSummary} from '#sepal/metrics'
import * as service from '#sepal/service'
import {tag} from '#sepal/tag'

const log = getLogger('limiter')

const MAX_AGE_SECONDS = 600
const AGE_BUCKETS = 6

// A request passes every tier in order and holds a token of each until it ends. A tier limits each value of
// its key separately - one user, one project - with the limits it gives for that value.
export const LimiterService = (name, options) => {
    const tiers = toTiers(options).map(tier => ({...tier, limiters: {}}))

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

    const getLimiter = (tier, key) => {
        if (!tier.limiters[key]) {
            tier.limiters[key] = TokenLimiter({...tier.limits(key), name: `${name}:${tier.name}:${key}`}, () => {
                delete tier.limiters[key]
                log.debug(() => `${limiterTag(name, tier.name, key)} removed`)
            })
            log.debug(() => `${limiterTag(name, tier.name, key)} added`)
        }
        return tier.limiters[key]
    }

    const acquire$ = (id, request) =>
        tiers.reduce(
            (acquired$, tier) => acquired$.pipe(
                switchMap(() => getLimiter(tier, tier.key(request)).getToken$(id))
            ),
            of(null)
        )

    const limiterService = {
        serviceName: name,
        serviceHandler$: ({id, ...request}) => {
            const {username} = request
            const endWaitTime = metrics.requestWaitTime.startTimer()
            metrics.tokens.inc({username})
            return acquire$(id, request).pipe(
                tap(() => endWaitTime()),
                finalize(() => metrics.tokens.dec({username}))
            )
        }
    }

    return {
        limiterService,
        limiter$: (observable$, id = uuid(), request) =>
            defer(() => {
                const stop$ = new Subject()
                return service.submit$(limiterService, {id, ...toRequest(request)}).pipe(
                    takeUntil(stop$),
                    mergeMap(() => observable$.pipe(
                        finalize(() => stop$.next())
                    ))
                )
            })
    }
}

// The original shape - per-user limits, optionally under global ones - is two tiers.
const toTiers = ({tiers, global, ...userLimits}) =>
    tiers ?? [
        {name: 'user', key: ({username}) => username, limits: () => userLimits},
        ...(global ? [{name: 'global', key: () => 'GLOBAL', limits: () => global}] : [])
    ]

const toRequest = request =>
    typeof request === 'object' && request !== null
        ? {...request, username: request.username || 'ANON'}
        : {username: request || 'ANON'}

const limiterTag = (name, tierName, key) => tag('Limiter', name, tierName, key)
