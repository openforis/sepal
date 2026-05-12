const {Observable, firstValueFrom, throwError, raceWith, switchMap} = require('rxjs')

const abortError = () => {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    return err
}

const isAbortError = error =>
    error?.name === 'AbortError'
        || error?.code === 'ABORT_ERR'
        || error?.message === 'Request was aborted.'

// Observable that emits and completes when `signal` aborts. Used as a
// notifier for raceWith / takeUntil to cancel an in-flight observable chain.
const fromAbortSignal$ = signal => new Observable(subscriber => {
    if (signal.aborted) {
        subscriber.next()
        subscriber.complete()
        return
    }
    const onAbort = () => {
        subscriber.next()
        subscriber.complete()
    }
    signal.addEventListener('abort', onAbort, {once: true})
    return () => signal.removeEventListener('abort', onAbort)
})

// Race the source against an abort signal. If the signal fires first, the
// resulting observable errors with AbortError and the source is unsubscribed,
// cascading cancellation through any chained operators (HTTP fetches, GUI
// round-trips, etc).
const withAbort$ = (source$, signal) => {
    if (!signal) return source$
    if (signal.aborted) return throwError(() => abortError())
    return source$.pipe(
        raceWith(fromAbortSignal$(signal).pipe(
            switchMap(() => throwError(() => abortError()))
        ))
    )
}

const awaitWithAbort = (source$, signal) =>
    firstValueFrom(withAbort$(source$, signal))

module.exports = {abortError, isAbortError, fromAbortSignal$, withAbort$, awaitWithAbort}
