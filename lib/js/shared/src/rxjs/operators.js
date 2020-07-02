const {EMPTY, Subject, concat, isObservable, of, pipe, timer, zip, range, throwError} = require('rx')
const {exhaustMap, filter, finalize, last, switchMap, switchMapTo, takeUntil, windowTime, retryWhen, mergeMap} = require('rx/operators')
const {_finalizeSubject} = require('sepal/rxjs')
const log = require('sepal/log').getLogger('rxjs')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

module.exports = {
    finalize: callback => {
        const complete = () => _finalizeSubject.next(-1)
        _finalizeSubject.next(1)
        return pipe(
            finalize(() => {
                try {
                    const result = callback()
                    if (isObservable(result)) {
                        result.subscribe({complete: () => complete()})
                    } else {
                        complete()
                    }
                } catch(e) {
                    complete()
                    throw e
                }
            })
        )
    },

    lastInWindow: time => {
        const cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next(true)),
            windowTime(time),
            switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
            filter(value => value !== EMPTY_WINDOW),
            takeUntil(cancel$)
        )
    },

    repeating: (project$, rate) => {
        const cancel$ = new Subject()
        return pipe(
            finalize(() => cancel$.next(true)),
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

    retry: (maxRetries, {minDelay = 500, maxDelay = 30000, exponentiality = 2, description} = {}) => pipe(
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
                            log.warn(`Retrying ${description ? `${description} ` : ''}(${retry}/${maxRetries}) in ${cappedExponentialBackoff}ms after error: ${error}`)
                            return timer(cappedExponentialBackoff)
                        }
                    }
                )
            )
        )
    )
}
