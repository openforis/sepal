const {of} = require('rxjs')
const {tap, map} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')

module.exports = ({create$, onCold, onHot}) => {
    const pool = {}

    const add = (slot, instance) =>
        pool[slot] = [...(pool[slot] || []), instance]

    const lock = instance =>
        instance.locked = true

    const release = instance =>
        instance.locked = false

    const releaseable = instance => ({
        item: instance.item,
        release: () => release(instance)
    })

    const hot$ = (slot, instance) =>
        of(instance).pipe(
            tap(({id}) => onHot && onHot(slot, id))
        )

    const cold$ = (slot, createArgs) =>
        create$(createArgs).pipe(
            map(item => ({
                id: uuid(),
                item
            })),
            tap(instance => add(slot, instance)),
            tap(({id}) => onCold && onCold(slot, id))
        )

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
                map(instance => releaseable(instance))
            )
    }
}
