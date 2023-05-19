const {
    EMPTY, Subject, ReplaySubject,
    concat, defer, exhaustMap, filter, finalize, first, forkJoin, isObservable, last, map, mergeMap, of, pipe,
    range, retryWhen, scan, switchMap, takeUntil, takeWhile, throwError, timer, windowTime, zip,
} = require('rxjs')

const log = require('#sepal/log').getLogger('rxjs')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

let _finalizeSubject

const _addFinalize = description => {
    if (!_finalizeSubject)
        _finalizeSubject = new ReplaySubject()
    _finalizeSubject.next({description, value: 1})
}
const _completeFinalize = description =>
    _finalizeSubject && _finalizeSubject.next({description, value: -1})

module.exports = {
    finalize$: defer(() => _finalizeSubject
        ? _finalizeSubject.pipe(
            scan((acc, {value}) => acc + value, 0),
            takeWhile(acc => {
                if (acc > 0) {
                    return true
                } else {
                    _finalizeSubject = null
                    log.debug('All finalize blocks completed')
                    return false
                }
            }),
            switchMap(() => EMPTY)
        )
        : EMPTY
    ),

    promise$: callback =>
        defer(() => {
            const $ = new Subject()
            const resolve = value => $.next(value)
            const reject = error => $.error(error)
            try {
                callback(resolve, reject)
            } catch (error) {
                reject(error)
            }
            return $.pipe(first())
        }),

    fromPromise: promise => {
        const $ = new ReplaySubject(1)
        promise
            .then(value => $.next(value))
            .catch(error => $.error(error))
        return $.pipe(first())
    },

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
        switchMap(() => EMPTY)
    ),

    retry: (maxRetries, {minDelay = 500, maxDelay = 30000, exponentiality = 1.5, description} = {}) => pipe(
        retryWhen(error$ =>
            zip(
                error$,
                range(1, maxRetries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => {
                        if (retry > maxRetries) {
                            return throwError(() => error)
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
    ),

    minDuration$: (observable$, minDurationMilliseconds) =>
        forkJoin({
            observable$,
            timer: timer(minDurationMilliseconds)
        }).pipe(
            map(({observable$}) => observable$)
        )
}
