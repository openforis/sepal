const {
    EMPTY, Subject, ReplaySubject,
    concat, defer, exhaustMap, filter, finalize, first, forkJoin, isObservable, last, map, mergeMap, of, pipe,
    range, retryWhen, switchMap, takeUntil, takeWhile, throwError, timer, windowTime, zip, throttleTime, groupBy, mergeScan, tap, scan,
} = require('rxjs')

const log = require('#sepal/log').getLogger('rxjs')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

const finalizeSubjects = {}

const _addFinalize = (groupId, description) => {
    if (!finalizeSubjects[groupId]) {
        finalizeSubjects[groupId] = new ReplaySubject()
    }
    finalizeSubjects[groupId].next({description, value: 1})
}
const _completeFinalize = (groupId, description) =>
    finalizeSubjects[groupId]?.next({description, value: -1})

module.exports = {
    finalizeObservable: (callback, groupId, description) => {
        const complete = groupId => {
            log.trace(() => `Finalize completed: [${groupId}] ${description}`)
            return _completeFinalize(groupId, description)
        }
        log.trace(() => `Finalize registered: ${description}`)
        _addFinalize(groupId, description)
        return pipe(
            finalize(() => {
                try {
                    const result = callback()
                    if (isObservable(result)) {
                        result.subscribe({
                            error: error => {
                                log.error(`Finalize failed: ${description}`, error)
                                complete(groupId)
                            },
                            complete: () => complete(groupId)
                        })
                    } else {
                        complete(groupId)
                    }
                } catch (e) {
                    complete(groupId)
                    throw e
                }
            })
        )
    },

    finalizeObservable$: groupId =>
        defer(() => finalizeSubjects[groupId]
            ? finalizeSubjects[groupId].pipe(
                scan((acc, {value}) => acc + value, 0),
                takeWhile(count => {
                    if (count > 0) {
                        return true
                    } else {
                        delete finalizeSubjects[groupId]
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
            const $ = new ReplaySubject(1)
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

    throttleTimeWithFinalValue: time =>
        pipe(
            throttleTime(time, null, {leading: true, trailing: true})
        ),

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
