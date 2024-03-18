const {
    Subject, ReplaySubject, of, finalize, map, mergeMap, switchMap, tap, range, first, timer,
    zipWith, takeUntil, concatMap, merge, groupBy, mergeScan, filter, defer, defaultIfEmpty
} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('pool')
const {tag} = require('#sepal/tag')
const {createGauge, createSummary} = require('#sepal/metrics')
const assert = require('#sepal/assert')
const {poolTag, userTag} = require('./tag')

const MAX_AGE_SECONDS = 600
const AGE_BUCKETS = 6

const metrics = {
    activeInstances: createGauge({
        name: 'sepal_workers_active_instances_total',
        help: 'SEPAL workers active instances'
    }),
    activeRequests: createGauge({
        name: 'sepal_workers_active_requests_total',
        help: 'SEPAL workers active requests'
    }),
    requestWaitTime: createSummary({
        name: 'sepal_workers_request_wait_time',
        help: 'SEPAL workers request wait time',
        maxAgeSeconds: MAX_AGE_SECONDS,
        ageBuckets: AGE_BUCKETS
    }),
    requestProcessingTime: createSummary({
        name: 'sepal_workers_request_processing_time',
        help: 'SEPAL workers request processing time',
        maxAgeSeconds: MAX_AGE_SECONDS,
        ageBuckets: AGE_BUCKETS
    })
}

const STICKY = Symbol('Sticky')
const ROUND_ROBIN = Symbol('Round-robin')
const RANDOM = Symbol('Random')

const StaticPool = ({
    name,
    strategy,
    instances,
    create$,
    createConcurrency = 1,
    createDelayMs = 1000
}) => {

    assert(strategy, strategy => [STICKY, ROUND_ROBIN, RANDOM].includes(strategy), `invalid strategy: ${strategy.toString()}`, true)

    const msg = (instance, action) =>
        `${tag(name, instance?.id)} ${action}`

    const poolInstances = []
    const activeInstances = {}
    const idleInstancePool$ = new Subject()
    const idleInstanceRequest$ = new Subject()
    const instanceRequest$ = new Subject()
    const begin$ = new Subject()
    const end$ = new Subject()

    const getActiveCount = () =>
        Object.keys(activeInstances).length

    const active$ = merge(
        begin$.pipe(map(({username, requestTag}) => ({username, requestTag, use: true}))),
        end$.pipe(map(({username, requestTag}) => ({username, requestTag})))
    ).pipe(
        groupBy(({username}) => username),
        mergeMap(username$ =>
            username$.pipe(
                mergeScan(
                    ({requestTags}, {username, requestTag, use}) =>
                        of({username, requestTags: use ? [...requestTags, requestTag] : _.without(requestTags, requestTag)}),
                    {requestTags: []}
                )
            )
        ),
        map(({username, requestTags}) => ({username, count: requestTags.length}))
    )

    const idle$ = active$.pipe(
        filter(({count}) => count === 0),
        map(({username}) => username)
    )

    const createInstance$ = count => {
        const id = uuid()
        const instance$ = new ReplaySubject(1)
        const instance = {id, instance$}
        
        timer(createDelayMs).pipe(
            tap(() => log.trace(msg(instance, `creating #${count}`))),
            switchMap(() => create$(id)),
            tap(() => log.debug(msg(instance, `created #${count}`))),
        ).subscribe({
            next: value => instance$.next(value),
            error: error => instance$.error(error),
            complete: () => {
                log.error('Unexpected stream complete')
                instance$.complete()
            }
        })

        return instance$.pipe(
            switchMap(() => of(instance)),
            first()
        )
    }

    const getNextInstance$ = () => {
        const idleInstanceResponse$ = new ReplaySubject(1)
        idleInstanceRequest$.next(idleInstanceResponse$)
        return idleInstanceResponse$.pipe(
            first()
        )
    }

    const getStickyInstance$ = username =>
        defer(() => {
            const activeInstance = activeInstances[username]
            if (activeInstance) {
                return of(activeInstance).pipe(
                    map(instance => ({
                        instance,
                        instanceAttributes: {stickyActive: true}
                    }))
                )
            } else {
                return getNextInstance$().pipe(
                    map(instance => ({
                        instance,
                        instanceAttributes: {stickyIdle: true}
                    })),
                )
            }
        })

    const getRoundRobinInstance$ = () =>
        defer(() => {
            return getNextInstance$().pipe(
                map(instance => ({
                    instance,
                    instanceAttributes: {roundRobin: true}
                }))
            )
        })

    const getRandomInstance$ = () =>
        defer(() => {
            return getNextInstance$().pipe(
                map(() => ({
                    instance: poolInstances[Math.floor(Math.random() * poolInstances.length)],
                    instanceAttributes: {random: true}
                }))
            )
        })

    const getInstance$ = username => {
        switch (strategy) {
        case STICKY:
            return getStickyInstance$(username)
        case ROUND_ROBIN:
            return getRoundRobinInstance$()
        case RANDOM:
            return getRandomInstance$()
        }
    }

    const attachInstance = (username, instance) => {
        activeInstances[username] = instance
        log.debug(msg(instance, `attached to ${userTag(username)}, ${getActiveCount()} active`))
        metrics.activeInstances.inc()
    }
    
    const detachInstance = username => {
        const instance = activeInstances[username]
        delete activeInstances[username]
        if (instance) {
            log.debug(msg(instance, `detached from ${userTag(username)}, ${getActiveCount()} active`))
            idleInstancePool$.next(instance)
        }
        metrics.activeInstances.dec()
    }

    const addInstanceToPool = instance => {
        idleInstancePool$.next(instance)
        poolInstances.push(instance)
    }
    
    range(1, instances).pipe(
        mergeMap(count => createInstance$(count), createConcurrency)
    ).subscribe({
        next: instance => addInstanceToPool(instance),
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.info(`Initialized ${poolTag(name)}, ${instances} instances`)
    })

    begin$.subscribe({
        next: () => {
            metrics.activeRequests.inc()
        },
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.info('Unexpected stream complete')
    })

    end$.subscribe({
        next: () => {
            metrics.activeRequests.dec()
        },
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.info('Unexpected stream complete')
    })
    
    idleInstancePool$.pipe(
        zipWith(idleInstanceRequest$)
    ).subscribe({
        next: ([instance, idleInstanceResponse$]) => {
            idleInstanceResponse$.next(instance)
        },
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.error('Unexpected stream complete')
    })

    instanceRequest$.pipe(
        concatMap(({username, requestTag, instanceResponse$, cancel$}) =>
            getInstance$(username).pipe(
                concatMap(({instance, instanceAttributes}) =>
                    of({username, requestTag, instanceResponse$, instance, instanceAttributes}).pipe(
                        takeUntil(cancel$.pipe(first())),
                        defaultIfEmpty({username, requestTag, instance, instanceAttributes, cancelled: true})
                    )
                )
            )
        )
    ).subscribe({
        next: ({username, requestTag, instanceResponse$, instance, instanceAttributes: {stickyIdle, stickyActive, roundRobin, random}, cancelled}) => {
            if (!instance) {
                log.warn('missing instance')
            } else {
                if (cancelled) {
                    if (stickyIdle) {
                        idleInstancePool$.next(instance)
                        log.debug(requestTag, msg(instance, 'cancelled, returning to pool'))
                    } else {
                        log.debug(requestTag, msg(instance, 'cancelled'))
                    }
                } else {
                    if (stickyIdle) {
                        attachInstance(username, instance)
                        log.debug(requestTag, msg(instance, 'using sticky/idle instance'))
                    } else if (stickyActive) {
                        log.debug(requestTag, msg(instance, 'using sticky/active instance'))
                    } else if (roundRobin) {
                        idleInstancePool$.next(instance)
                        log.debug(requestTag, msg(instance, 'using round-robin instance'))
                    } else if (random) {
                        idleInstancePool$.next(instance)
                        log.debug(requestTag, msg(instance, 'using random instance'))
                    }
                    instanceResponse$.next(instance)
                }
            }
        },
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.error('Unexpected stream complete')
    })

    idle$.subscribe({
        next: username => detachInstance(username),
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.error('Unexpected stream complete')
    })

    return (username, requestTag) => {
        const instanceResponse$ = new Subject()
        const cancel$ = new ReplaySubject(1)

        setImmediate(() => instanceRequest$.next({username, requestTag, instanceResponse$, cancel$}))

        const endRequestProcessingTime = metrics.requestProcessingTime.startTimer()
        const endRequestWaitTime = metrics.requestWaitTime.startTimer()

        return instanceResponse$.pipe(
            switchMap(({instance$}) => instance$),
            tap(() => {
                endRequestWaitTime()
                begin$.next({username, requestTag})
            }),
            finalize(() => {
                endRequestProcessingTime()
                cancel$.next()
                end$.next({username, requestTag})
            })
        )
    }
}

module.exports = {StaticPool, STICKY, ROUND_ROBIN, RANDOM}
