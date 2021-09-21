const {EMPTY, Subject, concat, isObservable, of, pipe, timer, zip, range, throwError} = require('rxjs')
const {exhaustMap, filter, finalize, last, switchMap, switchMapTo, takeUntil, windowTime, retryWhen, mergeMap} = require('rxjs/operators')
const {_addFinalize, _completeFinalize} = require('sepal/rxjs')
const log = require('sepal/log').getLogger('rxjs')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

module.exports = {
    finalize: (callback, description) => {
        const complete = () => {
            log.trace(() => `Finalize completed: ${description}`)
            return _completeFinalize(description)
        }
        log.trace(() => `Finalize registered: ${description}`)
        _addFinalize(description)
        return pipe(
            finalize(() => {
                try {
                    const result = callback()
                    if (isObservable(result)) {
                        result.subscribe({
                            error: error => {
                                log.error(`Finalize failed: ${description}`, error)
                                complete()
                            },
                            complete: () => complete()
                        })
                    } else {
                        complete()
                    }
                } catch (e) {
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
