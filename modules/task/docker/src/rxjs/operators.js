const {concat, defer, interval, of, pipe} = require('rxjs')
const {exhaustMap, filter, last, map, switchMap, windowTime} = require('rxjs/operators')
const progress = require('root/progress')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

module.exports = {
    lastInWindow: time =>
        pipe(
            windowTime(time),
            switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
            filter(value => value !== EMPTY_WINDOW)
        ),

    repeating: (project, rate) => {
        return pipe(
            switchMap(item =>
                concat(
                    defer(() => project(item)),
                    interval(rate).pipe(
                        exhaustMap(() => project(item)),
                    )
                )
            )
        )
    },

    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => progress({defaultMessage, messageKey, messageArgs}))
        )
}
