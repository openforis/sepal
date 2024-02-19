const {
    EMPTY, Subject, ReplaySubject,
    concat, defer, exhaustMap, filter, finalize, first, forkJoin, isObservable, last, map, of, pipe,
    switchMap, takeUntil, takeWhile, throwError, timer, windowTime, throttleTime, scan, retry,
} = require('rxjs')

const log = require('#sepal/log').getLogger('rxjs')

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')

const finalizeSubjects = {}

const _registerFinalize = (groupId, description) => {
    if (!finalizeSubjects[groupId]) {
        finalizeSubjects[groupId] = new ReplaySubject()
    }
    log.trace(() => `Finalize registered: [${groupId}] ${description}`)
    finalizeSubjects[groupId].next(1)
}

const _completeFinalize = (groupId, description) => {
    log.trace(() => `Finalize completed: [${groupId}] ${description}`)
    finalizeSubjects[groupId]?.next(-1)
}

module.exports = {
    finalizeObservable: (callback, groupId, description) => {
        _registerFinalize(groupId, description)
        return pipe(
            finalize(() => {
                try {
                    const result = callback()
                    if (isObservable(result)) {
                        result.subscribe({
                            error: error => {
                                log.error(`Finalize failed: ${description}`, error)
                                _completeFinalize(groupId, description)
                            },
                            complete: () => _completeFinalize(groupId, description)
                        })
                    } else {
                        _completeFinalize(groupId, description)
                    }
                } catch (e) {
                    _completeFinalize(groupId, description)
                    throw e
                }
            })
        )
    },

    finalizeObservable$: groupId =>
        defer(() => finalizeSubjects[groupId]
            ? finalizeSubjects[groupId].pipe(
                scan((acc, value) => acc + value, 0),
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
    ),    // ),

    autoRetry: ({
        maxRetries = 0,
        minRetryDelay = 500,
        maxRetryDelay = minRetryDelay,
        retryDelayFactor = 1,
        minRetriesBeforeTimeout = 0,
        retryTimeout,
        initialTimestamp,
        abort,
        onError,
        onAbort = onError,
        onRetryTimeout = onError,
        onMaxRetries = onError,
        onError$,
        onAbort$ = onError$,
        onRetryTimeout$ = onError$,
        onMaxRetries$ = onError$,
        onRetry
    }) => pipe(
        retry({
            delay: (error, retryCount) => {
                const elapsed = initialTimestamp
                    ? Date.now() - initialTimestamp
                    : undefined
                // handle no retries
                if (maxRetries === 0) {
                    return throwError(() => error)
                }
                // handle max retries
                if (maxRetries && retryCount >= maxRetries) {
                    const retryError = `Max retries (${maxRetries}) exceeded${elapsed ? ` after ${elapsed}ms` : ''}.`
                    onMaxRetries && onMaxRetries(error, retryError)
                    error.retryError = retryError
                    return onMaxRetries$
                        ? onMaxRetries$(error, retryError)
                        : throwError(() => error)
                }
                // handle timeout
                if (retryTimeout && elapsed && retryCount > minRetriesBeforeTimeout && elapsed > retryTimeout) {
                    const retryError = `Retry timeout (${retryTimeout}) exceeded after ${retryCount} ${retryCount === 1 ? 'attempt' : 'attempts'}.`
                    onRetryTimeout && onRetryTimeout(error, retryError)
                    error.retryError = retryError
                    return onRetryTimeout$
                        ? onRetryTimeout$(error, retryError)
                        : throwError(() => error)
                }
                // handle abort
                if (abort && abort(error)) {
                    const retryError = `Retries aborted after ${retryCount} ${retryCount === 1 ? 'attempt' : 'attempts'}${elapsed ? ` and ${elapsed}ms` : ''}.`
                    onAbort && onAbort(error, retryError)
                    error.retryError = retryError
                    return onAbort$
                        ? onAbort$(error, retryError)
                        : throwError(() => error)
                }
                // retry
                const retryDelay = Math.min(maxRetryDelay, minRetryDelay * Math.pow(retryDelayFactor, retryCount - 1))
                const retryMessage = `Retry ${retryCount}${maxRetries ? `/${maxRetries}` : ''} in ${retryDelay}ms.`
                onRetry && onRetry(error, retryMessage)
                return timer(retryDelay)
            }
        })
    ),

    minDuration$: (observable$, minDurationMilliseconds) =>
        forkJoin({
            observable$,
            timer: timer(minDurationMilliseconds)
        }).pipe(
            map(({observable$}) => observable$)
        )
}
