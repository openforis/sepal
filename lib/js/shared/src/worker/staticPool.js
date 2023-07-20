const {
    Subject, ReplaySubject, of, finalize, map, mergeMap, switchMap, tap, range, first, timer,
    zipWith, takeUntil, concatMap, merge, groupBy, mergeScan, filter, defer, defaultIfEmpty
} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('pool')
const {tag} = require('#sepal/tag')
const {createGauge, createSummary} = require('#sepal/metrics')
const {userTag} = require('./tag')

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

const StaticPool = ({
    name,
    instances,
    create$,
    createConcurrency = 1,
    createDelayMs = 1000
}) => {

    const msg = (instance, action) =>
        `${tag(name, instance.id)} ${action}`

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

    const getInstance$ = username =>
        defer(() => {
            const activeInstance = activeInstances[username]
            if (activeInstance) {
                return of(activeInstance).pipe(
                    map(instance => ({instance, active: true}))
                )
            } else {
                const idleInstanceResponse$ = new ReplaySubject(1)
                idleInstanceRequest$.next(idleInstanceResponse$)
                return idleInstanceResponse$.pipe(
                    map(instance => ({instance, idle: true})),
                    first()
                )
            }
        })

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
    
    range(1, instances).pipe(
        mergeMap(count => createInstance$(count), createConcurrency)
    ).subscribe({
        next: instance => idleInstancePool$.next(instance),
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.info(`Finished creating ${instances} instances`)
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
                concatMap(({instance, idle}) =>
                    of({username, requestTag, instanceResponse$, instance, idle}).pipe(
                        takeUntil(cancel$.pipe(first())),
                        defaultIfEmpty({username, requestTag, instance, idle, cancelled: true})
                    )
                )
            )
        )
    ).subscribe({
        next: ({username, requestTag, instanceResponse$, instance, idle, cancelled}) => {
            if (cancelled) {
                if (idle) {
                    idleInstancePool$.next(instance)
                    log.debug(requestTag, msg(instance, 'cancelled, returning to pool'))
                } else {
                    log.debug(requestTag, msg(instance, 'cancelled'))
                }
            } else {
                if (idle) {
                    attachInstance(username, instance)
                    log.debug(requestTag, msg(instance, 'using idle instance'))
                } else {
                    log.debug(requestTag, msg(instance, 'using active instance'))
                }
                instanceResponse$.next(instance)
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

module.exports = {StaticPool}