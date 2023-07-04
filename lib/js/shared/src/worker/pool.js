const {Subject, timer, of, filter, finalize, map, mergeMap, switchMap, takeUntil, tap, ReplaySubject, NEVER, concat, groupBy, merge, mergeScan} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('pool')
const {TokenLimiter} = require('#sepal/limiter/tokenLimiter')
const {tag} = require('#sepal/tag')
const {createGauge} = require('#sepal/metrics')

const metrics = {
    active: createGauge({
        name: 'sepal_pool_active_total',
        help: 'SEPAL instances active instances',
        labelNames: ['name']
    })
}

const poolTag = (name, instanceId) => tag('Pool', name, instanceId)

const Pool = ({
    name,
    maxIdleMilliseconds = 1000,
    minIdleCount = 0,
    findInstance,
    create$,
    isIdle,
    onUse,
    onRelease,
    onIdle,
    onMsg
}) => {
    const instances = []

    const use$ = new Subject()
    const release$ = new Subject()
    const dispose$ = new Subject()

    const active$ = merge(
        use$.pipe(map(instance => ({instance, value: 1}))),
        release$.pipe(map(instance => ({instance, value: -1})))
    ).pipe(
        groupBy(({instance}) => instance),
        mergeMap(instance$ =>
            instance$.pipe(
                mergeScan(({count}, {instance, value}) => of({instance, count: count + value}), {count: 0})
            )
        )
    )

    const idle$ = active$.pipe(
        filter(({count}) => count === 0),
        map(({instance}) => instance)
    )

    idle$.pipe(
        tap(instance => idle(instance)),
        mergeMap(instance =>
            timer(maxIdleMilliseconds).pipe(
                takeUntil(use$.pipe(
                    filter(({id}) => instance.id === id)
                )),
                map(() => instance)
            )
        )
    ).subscribe({
        next: instance => expired(instance),
        error: error => log.fatal('Pool idle$ stream failed:', error),
        complete: () => log.fatal('Pool idle$ stream completed')
    })

    const add = instance => {
        instances.push(instance)
        log.debug(msg(instance, `added, now ${instances.length}`))
        metrics.active.inc({name})
    }

    const remove = instance => {
        dispose$.next(instance)
        _.pull(instances, instance)
        log.debug(msg(instance, `removed, now ${instances.length}`))
        metrics.active.dec({name})
    }
        
    const msg = (instance, action) =>
        onMsg
            ? `${onMsg(instance, action)}`
            : `${poolTag(name, instance.id)} ${action} (now ${instances.length})`

    const idle = instance => {
        onIdle && onIdle(instance)
        log.debug(msg(instance, 'idle'))
    }

    const expired = instance => {
        const idleCount = _.filter(instances, isIdle).length
        if (idleCount > minIdleCount) {
            remove(instance)
            log.debug(msg(instance, 'disposed'))
        } else {
            log.debug(msg(instance, 'kept'))
        }
    }

    const use = (instance, value, requestTag) => {
        use$.next(instance)
        onUse && onUse(instance, value)
        log.debug(msg(instance, `used: ${requestTag}`))
    }

    const release = (instance, value, requestTag) => {
        release$.next(instance)
        onRelease && onRelease(instance, value)
        log.debug(msg(instance, `released: ${requestTag}`))
    }

    const hot = instance => {
        log.debug(msg(instance, 'recycled existing'))
        return instance
    }

    const cold = value => {
        const id = uuid()
        const instance$ = new ReplaySubject(1)
        const instance = {name, id, instance$}
        add(instance)

        create$(instance, value).pipe(
            takeUntil(
                dispose$.pipe(
                    filter(({id: currentId}) => instance.id === currentId)
                )
            )
        ).subscribe({
            next: value => instance$.next(value),
            error: error => instance$.error(error),
            complete: () => instance$.complete()
        })

        return instance
    }

    const getInstance = value => {
        const instance = findInstance(instances, value)
        return instance
            ? hot(instance)
            : cold(value)
    }

    return (value, requestTag) => {
        const instance = getInstance(value)
        return concat(of(instance), NEVER).pipe(
            tap(instance => use(instance, value, requestTag)),
            switchMap(({instance$}) => instance$),
            finalize(() => release(instance, value, requestTag))
        )
    }
}

const LimitedPool = ({name, rateWindowMs, maxRate, maxConcurrency, create$, ...args}) => {
    const rateLimiter = TokenLimiter({
        name: `${name}/R`,
        rateWindowMs,
        maxRate
    })
    const concurrencyLimiter = TokenLimiter({
        name: `${name}/C`,
        maxConcurrency
    })
    const instances$ = Pool({
        name,
        ...args,
        create$: (instance, value) =>
            rateLimiter.getToken$().pipe(
                mergeMap(() => create$(instance, value))
            )
    })
    return (value, requestTag) =>
        concurrencyLimiter.getToken$().pipe(
            mergeMap(() => instances$(value, requestTag))
        )
}

module.exports = {Pool, LimitedPool}
