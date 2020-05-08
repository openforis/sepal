const {Subject, concat, of, pipe, timer} = require('rxjs')
const {exhaustMap, filter, finalize, last, map, switchMap, takeUntil, windowTime} = require('rxjs/operators')
const progress = require('root/progress')
const log = require('sepal/log').getLogger('task')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

module.exports = {
    lastInWindow: time => {
        var cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next()),
            windowTime(time),
            switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
            filter(value => value !== EMPTY_WINDOW),
            takeUntil(cancel$)
        )
    },

    repeating: (project$, rate) => {
        var cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next()),
            switchMap(item =>
                timer(0, rate).pipe(
                    exhaustMap(() => project$(item))
                )
            ),
            takeUntil(cancel$)
        )
    },

    progress: ({defaultMessage, messageKey, messageArgs}) =>
        pipe(
            map(() => progress({defaultMessage, messageKey, messageArgs}))
        )
}
