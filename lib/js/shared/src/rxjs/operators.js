const {EMPTY, Subject, concat, of, pipe, timer, zip, range, throwError} = require('rxjs')
const {exhaustMap, filter, finalize, last, switchMap, switchMapTo, takeUntil, windowTime, retryWhen, mergeMap} = require('rxjs/operators')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

module.exports = {
    lastInWindow: time => {
        const cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next()),
            windowTime(time),
            switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
            filter(value => value !== EMPTY_WINDOW),
            takeUntil(cancel$)
        )
    },

    repeating: (project$, rate) => {
        const cancel$ = new Subject()
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

    swallow: () => pipe(
        switchMapTo(EMPTY)
    ),

    retry: (maxRetries, baseDelay = 500, exponentiality = 2) => pipe(
        retryWhen(error$ =>
            zip(
                error$,
                range(0, maxRetries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => retry === maxRetries
                        ? throwError(error)
                        : timer(Math.pow(exponentiality, retry) * baseDelay)
                )
            )
        )
    )
}
