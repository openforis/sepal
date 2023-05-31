const {Subject, of, finalize, map, mergeMap, switchMap, tap, ReplaySubject, range, first, timer, zipWith, takeUntil, concatMap, concatWith, merge, groupBy, mergeScan, filter} = require('rxjs')
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
            log.debug(msg(instance, `idle (${username}), ${getActiveCount()} active`))
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
                log.warn('Unexpected complete')
                instance$.complete()
            }
        })

        return instance$.pipe(
            switchMap(() => of(instance)),
            first()
        )
    }
    
    range(1, instances).pipe(
        mergeMap(count => createInstance$(count), createConcurrency)
    ).subscribe({
        next: instance => idlePool$.next(instance),
        error: error => log.error('Unexpected error', error),
        complete: () => log.info(`Finished creating ${instances} instances`)
    })

    instanceRequest$.pipe(
        zipWith(idlePool$),
        concatMap(([{username, requestTag, instanceResponse$, cancel$}, instance]) =>
            of({username, requestTag, instanceResponse$, instance}).pipe(
                takeUntil(cancel$),
                concatWith(of({username, requestTag, instance, cancelled: true})),
                first()
            )
        )
    ).subscribe({
        next: ({username, requestTag, instanceResponse$, instance, cancelled}) => {
            if (cancelled) {
                log.debug(requestTag, msg(instance, 'cancelled'))
                idlePool$.next(instance)
            } else {
                const activeInstance = activePool[username]
                if (activeInstance) {
                    log.debug(requestTag, msg(activeInstance, 'using active instance'))
                    instanceResponse$.next(activeInstance)
                    idlePool$.next(instance)
                } else {
                    activePool[username] = instance
                    log.debug(requestTag, msg(instance, `using idle instance, ${getActiveCount()} active`))
                    instanceResponse$.next(instance)
                }
            }
        },
        error: error => log.warn('Unexpected error:', error),
        complete: () => log.warn('Unexpected complete')
    })

    idle$.subscribe({
        next: username => idle(username),
        error: error => log.error('Unexpected idle$ error', error),
        complete: () => log.error('Unexpected idle$ complete')
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
