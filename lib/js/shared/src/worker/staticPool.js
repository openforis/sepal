const {Subject, ReplaySubject, of, finalize, map, mergeMap, switchMap, tap, range, first, timer, zipWith, takeUntil, concatMap, concatWith, merge, groupBy, mergeScan, filter, zip, defer} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('pool')
const {tag} = require('#sepal/tag')
// const {createGauge} = require('#sepal/metrics')

// const metrics = {
//     active: createGauge({
//         name: 'sepal_pool_active_total',
//         help: 'SEPAL instances active instances',
//         labelNames: ['name']
//     })
// }

const StaticPool = ({
    name,
    instances,
    create$,
    createConcurrency = 1,
    createDelayMs = 1000
}) => {

    const msg = (instance, action) =>
        `${tag(name, instance.id)} ${action}`

    const activePool = {}
    const idlePool$ = new Subject()
    const idleInstanceRequest$ = new Subject()
    const instanceRequest$ = new Subject()
    const use$ = new Subject()
    const release$ = new Subject()

    const getActiveCount = () =>
        Object.keys(activePool).length

    const active$ = merge(
        use$.pipe(map(({username, requestTag}) => ({username, requestTag, use: true}))),
        release$.pipe(map(({username, requestTag}) => ({username, requestTag})))
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
        )
    )
    
    const idle$ = active$.pipe(
        filter(({requestTags}) => requestTags.length === 0),
        map(({username}) => username)
    )

    const idle = username => {
        const instance = activePool[username]
        delete activePool[username]
        if (instance) {
            log.debug(msg(instance, `releasing idle instance, ${getActiveCount()} active`))
            idlePool$.next(instance)
        }
    }

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
            const activeInstance = activePool[username]
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
    
    idlePool$.pipe(
        zipWith(idleInstanceRequest$)
    ).subscribe({
        next: ([instance, idleInstanceResponse$]) => {
            idleInstanceResponse$.next(instance)
        },
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.error('Unexpected stream complete')
    })

    range(1, instances).pipe(
        mergeMap(count => createInstance$(count), createConcurrency)
    ).subscribe({
        next: instance => idlePool$.next(instance),
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.info(`Finished creating ${instances} instances`)
    })

    instanceRequest$.pipe(
        concatMap(({username, requestTag, instanceResponse$, cancel$}) =>
            zip(of({username, requestTag, instanceResponse$}), getInstance$(username)).pipe(
                concatMap(([{username, requestTag, instanceResponse$}, {instance, idle}]) =>
                    of({username, requestTag, instanceResponse$, instance, idle}).pipe(
                        takeUntil(cancel$.pipe(first())),
                        concatWith(of({username, requestTag, instance, idle, cancelled: true})),
                        first()
                    )
                )
            )
        )
    ).subscribe({
        next: ({username, requestTag, instanceResponse$, instance, idle, cancelled}) => {
            if (cancelled) {
                if (idle) {
                    idlePool$.next(instance)
                    log.debug(requestTag, msg(instance, 'cancelled, returning to pool'))
                } else {
                    log.debug(requestTag, msg(instance, 'cancelled'))
                }
            } else {
                if (idle) {
                    activePool[username] = instance
                    log.debug(requestTag, msg(instance, `using idle instance, ${getActiveCount()} active`))
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
        next: username => idle(username),
        error: error => log.error('Unexpected stream error:', error),
        complete: () => log.error('Unexpected stream complete')
    })

    return (username, requestTag) => {
        const instanceResponse$ = new Subject()
        const cancel$ = new ReplaySubject(1)

        setImmediate(() => instanceRequest$.next({username, requestTag, instanceResponse$, cancel$}))

        return instanceResponse$.pipe(
            switchMap(({instance$}) => instance$),
            tap(() => use$.next({username, requestTag})),
            finalize(() => {
                cancel$.next()
                release$.next({username, requestTag})
            })
        )
    }
}

module.exports = {StaticPool}
