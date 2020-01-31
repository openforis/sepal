const {Subject, timer, of, concat} = require('rxjs')
const {tap, map, mergeMap, takeUntil, mapTo, filter, finalize, switchMap} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepal/log')('pool')
const {Limiter$} = require('sepal/limiter')

const Pool = ({name, maxIdleMilliseconds = 1000, minIdleCount = 0, create$, onCold, onHot, onRelease, onDispose, onKeep, onMsg}) => {
    const pool = []
    const lock$ = new Subject()
    const unlock$ = new Subject()

    lock$.subscribe(
        instance => instance.locked = true,
        error => log.fatal('Pool lock stream failed:', error),
        () => log.fatal('Pool lock stream completed')
    )

    unlock$.pipe(
        tap(instance => instance.locked = false),
        mergeMap(instance =>
            timer(maxIdleMilliseconds).pipe(
                takeUntil(lock$.pipe(
                    filter(currentInstance => currentInstance === instance)
                )),
                mapTo(instance)
            )
        )
    ).subscribe(
        instance => dispose(instance),
        error => log.fatal('Pool unlock stream failed:', error),
        () => log.fatal('Pool unlock stream completed')
    )

    const lock = instance =>
        lock$.next(instance)

    const unlock = instance =>
        unlock$.next(instance)

    const instanceId = id => `${name}.${id.substr(-4)}`

    const add = instance =>
        pool.push(instance)
        
    const msg = (instance, action) =>
        onMsg
            ? `${onMsg({instanceId: `${name}.${instance.id.substr(-4)}`, action})} (${pool.length} active)`
            : `Pool instance [${name}.${instance.id.substr(-4)}] ${action} (${pool.length} active)`

    const dispose = instance => {
        const idleCount = _.filter(pool, instance => !instance.locked).length
        if (idleCount > minIdleCount) {
            _.pull(pool, instance)
            log.debug(msg(instance, 'disposed'))
            onDispose && onDispose({id: instance.id, item: instance.item, instanceId: instanceId(instance.id)})
        } else {
            log.debug(msg(instance, 'kept'))
            onKeep && onKeep({id: instance.id, item: instance.item, instanceId: instanceId(instance.id)})
        }
    }

    const release = instance => {
        unlock(instance)
        log.debug(msg(instance, 'released'))
        onRelease && onRelease({id: instance.id, instanceId: instanceId(instance.id)})
    }

    const hot$ = instance =>
        of(instance).pipe(
            tap(instance => log.debug(msg(instance, 'recycled'))),
            tap(({id}) => onHot && onHot({id, instanceId: instanceId(id)}))
        )

    const cold$ = () => {
        const id = uuid()
        return create$(instanceId(id)).pipe(
            map(item => ({id, item})),
            tap(instance => add(instance)),
            tap(instance => log.debug(msg(instance, 'created'))),
            tap(({id}) => onCold && onCold({id, instanceId: instanceId(id)}))
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
    const rateLimiter$ = Limiter$({
        name: `${name}/R`,
        rateWindowMs,
        maxRate
    })
    const concurrencyLimiter$ = Limiter$({
        name: `${name}/C`,
        maxConcurrency
    })
    const pool = Pool({
        name,
        ...args,
        create$: instanceId =>
            rateLimiter$().pipe(
                mergeMap(() => create$(instanceId))
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
