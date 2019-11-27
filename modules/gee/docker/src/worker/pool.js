const {Subject, timer, of} = require('rxjs')
const {tap, map, mergeMap, takeUntil, mapTo, filter} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')

module.exports = ({name, create$, onCold, onHot, onRelease, onDispose, maxIdleMilliseconds = 1000, minIdleCount = 0}) => {
    const pool = []
    const lock$ = new Subject()
    const unlock$ = new Subject()

    lock$.subscribe(
        instance => instance.locked = true
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
        instance => dispose(instance)
    )

    const lock = instance =>
        lock$.next(instance)

    const unlock = instance =>
        unlock$.next(instance)

    const instanceId = id => `${name}.${id.substr(-4)}`

    const add = instance =>
        pool.push(instance)

    const dispose = instance => {
        const idleCount = _.filter(pool, instance => !instance.locked).length
        if (idleCount > minIdleCount) {
            onDispose && onDispose({id: instance.id, item: instance.item, instanceId: instanceId(instance.id)})
            _.pull(pool, instance)
        }
    }

    const releaseable = instance => ({
        item: instance.item,
        release: () => {
            unlock(instance)
            onRelease && onRelease({id: instance.id, instanceId: instanceId(instance.id)})
        }
    })

    const hot$ = instance =>
        of(instance).pipe(
            tap(({id}) => onHot && onHot({id, instanceId: instanceId(id)}))
        )

    const cold$ = () => {
        const id = uuid()
        return create$(instanceId(id)).pipe(
            map(item => ({id, item})),
            tap(instance => add(instance)),
            tap(({id}) => onCold && onCold({id, instanceId: instanceId(id)}))
        )
    }

    const instance$ = instance =>
        instance
            ? hot$(instance)
            : cold$()

    return {
        get$: () =>
            instance$(_.find(pool, ({locked}) => !locked)).pipe(
                tap(instance => lock(instance)),
                map(instance => releaseable(instance))
            )
    }
}
