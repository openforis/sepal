const {Subject, of, finalize, map, mergeMap, switchMap, tap, ReplaySubject, range, first, timer, zipWith, takeUntil, concatMap, concatWith} = require('rxjs')
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
    const userJobs = {}
    const idlePool$ = new Subject()
    const instanceRequest$ = new Subject()

    const getActiveCount = () =>
        Object.keys(activePool).length

    const release = (username, requestTag) => {
        const instance = activePool[username]
        const usages = _.without(userJobs[username], requestTag)
        log.debug(requestTag, msg(instance, `release, ${usages.length} jobs`))
        if (usages.length === 0) {
            idle(username)
        } else {
            userJobs[username] = usages
        }
    }

    const idle = username => {
        const instance = activePool[username]
        delete activePool[username]
        delete userJobs[username]
        log.debug(msg(instance, `idle (${username}), ${getActiveCount()} active`))
        idlePool$.next(instance)
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
                const ownInstance = activePool[username]
                if (ownInstance) {
                    log.debug(requestTag, msg(ownInstance, `using own instance, ${userJobs[username].length} jobs`))
                    instanceResponse$.next(ownInstance)
                    idlePool$.next(instance)
                } else {
                    activePool[username] = instance
                    log.debug(requestTag, msg(instance, `using idle instance, ${getActiveCount()} active, 1 job`))
                    instanceResponse$.next(instance)
                }
            }
        },
        error: error => log.warn('Unexpected error:', error),
        complete: () => log.warn('Unexpected complete')
    })

    return (username, requestTag) => {
        const instanceResponse$ = new ReplaySubject(1)
        const cancel$ = new ReplaySubject(1)

        if (userJobs[username]) {
            userJobs[username].push(requestTag)
        } else {
            userJobs[username] = [requestTag]
        }

        instanceRequest$.next({username, requestTag, instanceResponse$, cancel$})

        return instanceResponse$.pipe(
            switchMap(({instance$}) => instance$),
            finalize(() => {
                cancel$.next()
                instanceResponse$.complete()
                release(username, requestTag)
            })
        )
    }
}

module.exports = {StaticPool}
