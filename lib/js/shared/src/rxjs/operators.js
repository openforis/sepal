const {EMPTY, Subject, concat, of, pipe, timer, zip, range, throwError} = require('rxjs')
const {exhaustMap, filter, finalize, last, switchMap, switchMapTo, takeUntil, windowTime, retryWhen, mergeMap} = require('rxjs/operators')
const log = require('sepal/log').getLogger('rxjs')

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

    retry: (maxRetries, {minDelay = 500, maxDelay = 30000, exponentiality = 2} = {}) => pipe(
        retryWhen(error$ =>
            zip(
                error$,
                range(1, maxRetries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => {
                        if (retry > maxRetries) {
                            return throwError(error)
                        } else {
                            const exponentialBackoff = Math.pow(exponentiality, retry) * minDelay
                            const cappedExponentialBackoff = Math.min(exponentialBackoff, maxDelay)
                            log.warn(`Retrying (${retry}/${maxRetries}) in ${cappedExponentialBackoff}ms after error: ${error}`)
                            return timer(cappedExponentialBackoff)
                        }
                    }
                )
            )
        )
    )
}
