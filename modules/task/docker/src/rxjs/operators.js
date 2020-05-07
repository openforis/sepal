const {Subject, timer, pipe} = require('rxjs')
const {exhaustMap, filter, finalize, last, map, switchMap, takeUntil, windowTime} = require('rxjs/operators')
const progress = require('root/progress')

module.exports = {
    lastInWindow: timeSpan => {
        const EMPTY_WINDOW = Symbol()
        const cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next()),
            windowTime(timeSpan),
            switchMap(window$ =>
                window$.pipe(
                    last(null, EMPTY_WINDOW)
                )
            ),
            filter(value => value !== EMPTY_WINDOW),
            takeUntil(cancel$)
        )
    },

    repeating: (project$, period) => {
        const cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next()),
            switchMap(item =>
                timer(0, period).pipe(
                    exhaustMap(() => project$(item)),
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
