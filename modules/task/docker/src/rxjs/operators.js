const {Subject, concat, interval, of, pipe} = require('rxjs')
const {exhaustMap, filter, finalize, last, map, switchMap, takeUntil, windowTime} = require('rxjs/operators')
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
        const finalized$ = new Subject()
        return pipe(
            finalize(() => finalized$.next(true)),
            switchMap(item =>
                interval(rate).pipe(
                    exhaustMap(() => project(item)),
                    takeUntil(finalized$)
                )
            )
        )
    },

    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => progress({defaultMessage, messageKey, messageArgs}))
        )
}
