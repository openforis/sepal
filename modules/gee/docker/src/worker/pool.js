const {of} = require('rxjs')
const {tap, map} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')

module.exports = ({create$, onCold, onHot, onRelease}) => {
    const pool = {}

    const jobId = (slot, id) => `${slot}.${id.substr(-4)}`

    const add = (slot, instance) =>
        pool[slot] = [...(pool[slot] || []), instance]

    const lock = instance =>
        instance.locked = true

    const release = instance =>
        instance.locked = false

    const releaseable = (slot, instance) => ({
        item: instance.item,
        release: () => {
            release(instance)
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
        get$: (slot, createArgs) =>
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
