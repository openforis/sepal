const {Subject, of, filter, finalize, map, mergeMap, switchMap, tap, ReplaySubject, NEVER, concat, groupBy, merge, mergeScan, range, first, zip, delay, defer, timer, reduce, scan} = require('rxjs')
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

const poolTag = (name, instanceId) => tag('Pool', name, instanceId)

const StaticPool = ({
    name,
    instanceCount,
    create$,
    createConcurrency = 1,
    createDelayMs = 1000,
    onMsg
}) => {

    const msg = (instance, action) =>
        onMsg
            ? `${onMsg(instance, action)}`
            : `${poolTag(name, instance.id)} ${action}`

    const activePool = {}
    const idlePool$ = new ReplaySubject(instanceCount)
    const use$ = new Subject()
    const release$ = new Subject()
    const idleRequest$ = new Subject()

    const idleResponse$ = zip(idlePool$, idleRequest$).pipe(
        map(([instance, requestId]) => ({instance, requestId}))
    )

    const active$ = merge(
        use$.pipe(map(({instance, username}) => ({instance, username, value: 1}))),
        release$.pipe(map(({instance, username}) => ({instance, username, value: -1})))
    ).pipe(
        groupBy(({instance}) => instance),
        mergeMap(instance$ =>
            instance$.pipe(
                mergeScan(({count}, {instance, username, value}) => of({instance, username, count: count + value}), {count: 0})
            )
        )
    )

    const idle$ = active$.pipe(
        filter(({count}) => count === 0)
    )

    const getOwnInstance = (username, requestTag) => {
        const instance = activePool[username]
        if (instance) {
            log.debug(requestTag, msg(instance, 'getting own instance'))
            return instance
        }
        return null
    }

    const getOwnInstance$ = (username, requestTag) => {
        const instance = getOwnInstance(username, requestTag)
        return instance ? of(instance) : null
    }

    const getIdleInstance$ = (username, requestTag) => {
        const requestId = uuid()
        const instance$ = new ReplaySubject(1)
        idleResponse$.pipe(
            filter(idleInstance => idleInstance.requestId === requestId),
            map(({instance}) => instance),
            first()
        ).subscribe({
            next: instance => {
                const ownInstance = getOwnInstance(username, requestTag)
                if (ownInstance) {
                    instance$.next(ownInstance)
                    idlePool$.next(instance)
                } else {
                    log.debug(requestTag, msg(instance, 'getting idle instance'))
                    activePool[username] = instance
                    instance$.next(instance)
                }
            },
            error: error => log.warn('Unexpected error', error)
        })

        log.trace(`Requesting idle instance: ${requestTag}`)
        idleRequest$.next(requestId)
        return instance$.pipe(first())
    }

    const getInstance$ = (username, requestTag) =>
        getOwnInstance$(username, requestTag) || getIdleInstance$(username, requestTag)

    const use = (instance, username) => {
        use$.next({instance, username})
    }

    const release = (instance, username) => {
        release$.next({instance, username})
    }

    const idle = (instance, username) => {
        delete activePool[username]
        idlePool$.next(instance)
        log.debug(msg(instance, 'idle'))
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
    
    range(1, instanceCount).pipe(
        mergeMap(count => createInstance$(count), createConcurrency)
    ).subscribe({
        next: instance => idlePool$.next(instance),
        error: error => log.error('Unexpected error', error),
        complete: () => log.info('Finished creating instances')
    })

    idle$.subscribe({
        next: ({instance, username}) => idle(instance, username),
        error: error => log.error('Unexpected idle$ error', error),
        complete: () => log.error('Unexpected idle$ complete')
    })

    return (username, requestTag) =>
        getInstance$(username, requestTag).pipe(
            tap(instance => use(instance, username)),
            switchMap(instance =>
                instance.instance$.pipe(
                    finalize(() => release(instance, username))
                )
            )
        )
}

module.exports = {StaticPool}
