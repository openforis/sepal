const {Subject, timer, of, concat, filter, finalize, map, mergeMap, switchMap, takeUntil, tap} = require('rxjs')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('pool')
const {TokenLimiter$} = require('#sepal/limiter/tokenLimiter')
const {tag} = require('#sepal/tag')
const {startIntervalMetrics} = require('../metrics')

const poolTag = (name, instanceId) => tag('Pool', name, instanceId)

const STATS_INTERVAL_MS = 60000

const Pool = ({name, maxIdleMilliseconds = 1000, minIdleCount = 0, create$, onCold, onHot, onRelease, onDispose, onKeep, onMsg}) => {
    const pool = []
    const lock$ = new Subject()
    const unlock$ = new Subject()

    const stats = {
        show: false
    }

    startIntervalMetrics(publishMetrics => {
        const active = pool.length
        if (active) {
            stats.show = true
        }
        if (stats.show) {
            publishMetrics(poolTag(name), {active})
        }
        if (!active) {
            stats.show = false
        }
    }, STATS_INTERVAL_MS)

    lock$.subscribe({
        next: instance => instance.locked = true,
        error: error => log.fatal('Pool lock stream failed:', error),
        complete: () => log.fatal('Pool lock stream completed')
    })

    unlock$.pipe(
        tap(instance => instance.locked = false),
        mergeMap(instance =>
            timer(maxIdleMilliseconds).pipe(
                takeUntil(lock$.pipe(
                    filter(currentInstance => currentInstance === instance)
                )),
                map(() => instance)
            )
        )
    ).subscribe({
        next: instance => dispose(instance),
        error: error => log.fatal('Pool unlock stream failed:', error),
        complete: () => log.fatal('Pool unlock stream completed')
    })

    const lock = instance =>
        lock$.next(instance)

    const unlock = instance =>
        unlock$.next(instance)

    const add = instance => {
        pool.push(instance)
    }
        
    const msg = (instance, action) =>
        onMsg
            ? `${onMsg({name, instanceId: instance.id, action})} (${pool.length} active)`
            : `${poolTag(name, instance.id)} ${action} (${pool.length} active)`

    const dispose = instance => {
        const idleCount = _.filter(pool, instance => !instance.locked).length
        if (idleCount > minIdleCount) {
            _.pull(pool, instance)
            log.debug(msg(instance, 'disposed'))
            onDispose && onDispose({name, instanceId: instance.id, item: instance.item})
        } else {
            log.debug(msg(instance, 'kept'))
            onKeep && onKeep({name, instanceId: instance.id, item: instance.item})
        }
    }

    const release = instance => {
        unlock(instance)
        log.debug(msg(instance, 'released'))
        onRelease && onRelease({name, instanceId: instance.id})
    }

    const hot$ = instance =>
        of(instance).pipe(
            tap(instance => log.debug(msg(instance, 'recycled existing'))),
            tap(instance => onHot && onHot({name, instanceId: instance.id}))
        )

    const cold$ = () => {
        const id = uuid()
        return create$({name, instanceId: id}).pipe(
            map(item => ({id, item})),
            tap(instance => add(instance)),
            tap(instance => log.debug(msg(instance, 'created new'))),
            tap(instance => onCold && onCold({name, instanceId: instance.id}))
        )
    }

    const getInstance$ = () => {
        const instance = _.find(pool, ({locked}) => !locked)
        return instance
            ? hot$(instance)
            : cold$()
    }

    return {
        getInstance$: () =>
            getInstance$().pipe(
                switchMap(instance =>
                    concat(of(instance), new Subject()).pipe(
                        tap(instance => lock(instance)),
                        map(({item}) => item),
                        finalize(() => release(instance))
                    )
                )
            )
    }
}

const LimitedPool = ({name, rateWindowMs, maxRate, maxConcurrency, create$, ...args}) => {
    const rateLimiter$ = TokenLimiter$({
        name: `${name}/R`,
        rateWindowMs,
        maxRate
    })
    const concurrencyLimiter$ = TokenLimiter$({
        name: `${name}/C`,
        maxConcurrency
    })
    const pool = Pool({
        name,
        ...args,
        create$: ({name, instanceId}) =>
            rateLimiter$().pipe(
                mergeMap(() => create$({name, instanceId}))
            )
    })
    return {
        getInstance$: () =>
            concurrencyLimiter$().pipe(
                mergeMap(() => pool.getInstance$())
            )
    }
}

module.exports = {Pool, LimitedPool}
