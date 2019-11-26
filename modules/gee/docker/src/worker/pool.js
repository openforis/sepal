const {Subject, timer, of} = require('rxjs')
const {tap, map, mergeMap, takeUntil, mapTo, filter} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')

module.exports = ({create$, onCold, onHot, onRelease, onDispose, maxIdleMilliseconds, minIdleCount}) => {
    const pool = {}
    const lock$ = new Subject()
    const unlock$ = new Subject()

    lock$.subscribe(
        instance => instance.locked = true
    )

    unlock$.subscribe(
        ({instance}) => instance.locked = false
    )

    unlock$.pipe(
        mergeMap(
            ({slot, instance}) =>
                timer(maxIdleMilliseconds).pipe(
                    mapTo({slot, instance}),
                    takeUntil(lock$.pipe(
                        filter(i => i === instance)
                    ))
                )
        )
    ).subscribe(
        ({slot, instance}) => dispose(slot, instance)
    )

    const jobId = (slot, id) => `${slot}.${id.substr(-4)}`

    const add = (slot, instance) =>
        pool[slot] = [...(pool[slot] || []), instance]

    const lock = instance =>
        lock$.next(instance)

    const unlock = (slot, instance) =>
        unlock$.next(({slot, instance}))

    const dispose = (slot, instance) => {
        const idleCount = _.filter(pool[slot], instance => !instance.locked).length
        if (idleCount > minIdleCount) {
            onDispose && onDispose({slot, id: instance.id, item: instance.item, jobId: jobId(slot, instance.id)})
            _.pull(pool[slot], instance)
        }
    }

    const releaseable = (slot, instance) => ({
        item: instance.item,
        release: () => {
            unlock(slot, instance)
            onRelease && onRelease({slot, id: instance.id, jobId: jobId(slot, instance.id)})
        }
    })

    const hot$ = (slot, instance) =>
        of(instance).pipe(
            tap(({id}) => onHot && onHot({slot, id, jobId: jobId(slot, id)}))
        )

    const cold$ = (slot, createArgs) => {
        const id = uuid()
        return create$({...createArgs, jobId: jobId(slot, id)}).pipe(
            map(item => ({id, item})),
            tap(instance => add(slot, instance)),
            tap(({id}) => onCold && onCold({slot, id, jobId: jobId(slot, id)}))
        )
    }

    const instance$ = ({slot, instance, createArgs}) =>
        instance
            ? hot$(slot, instance)
            : cold$(slot, createArgs)

    return {
        get$: ({slot, createArgs}) =>
            instance$({
                slot,
                instance: _.find(pool[slot], ({locked}) => !locked),
                createArgs
            }).pipe(
                tap(instance => lock(instance)),
                map(instance => releaseable(slot, instance))
            )
    }
}
