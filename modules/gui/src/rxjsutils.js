import {pipe, retry, throwError, timer} from 'rxjs'

export const autoRetry = ({
    maxRetries = 0,
    minRetryDelay = 500,
    maxRetryDelay = minRetryDelay,
    retryDelayFactor = 1,
    minRetriesBeforeTimeout = 0,
    retryTimeout,
    initialTimestamp,
    abort,
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
            // handle abort
            if (abort && abort(error)) {
                const retryError = 'Non-retriable'
                return onAbort$
                    ? onAbort$(error, retryError)
                    : throwError(() => new Error(retryError, {cause: error}))
            }
            // handle no retrie
            if (maxRetries === 0) {
                return throwError(() => new Error('Zero retries allowed', {cause: error}))
            }
            // handle max retries
            if (maxRetries > 0 && retryCount >= maxRetries) {
                const retryError = `Max retries (${maxRetries}) exceeded${elapsed ? ` after ${elapsed}ms` : ''}.`
                return onMaxRetries$
                    ? onMaxRetries$(error, retryError)
                    : throwError(() => new Error(retryError, {cause: error}))
            }
            // handle timeout
            if (retryTimeout && elapsed && retryCount > minRetriesBeforeTimeout && elapsed > retryTimeout) {
                const retryError = `Retry timeout (${retryTimeout}) exceeded after ${retryCount} ${retryCount === 1 ? 'attempt' : 'attempts'}.`
                return onRetryTimeout$
                    ? onRetryTimeout$(error, retryError)
                    : throwError(() => new Error(retryError, {cause: error}))
            }
            // retry
            const retryDelay = Math.min(maxRetryDelay, minRetryDelay * Math.pow(retryDelayFactor, retryCount - 1))
            const retryInfo = maxRetries
                ? ` (${retryCount}/${maxRetries > 0 ? maxRetries : 'infinite'})`
                : ''
            const retryMessage = `Retrying in ${retryDelay}ms${retryInfo}.`
            onRetry && onRetry(error, retryMessage, retryDelay, retryCount)
            return timer(retryDelay)
        },
        resetOnSuccess: true
    })
)
