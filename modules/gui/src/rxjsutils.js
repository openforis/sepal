import {pipe, retry, throwError, timer} from 'rxjs'

export const autoRetry = ({
    maxRetries = 0,
    minRetryDelay = 500,
    maxRetryDelay = minRetryDelay,
    retryDelayFactor = 1,
    minRetriesBeforeTimeout = 0,
    retryTimeout,
    initialTimestamp,
    skip,
    onRetryError,
    onRetry
}) => pipe(
    retry({
        delay: (error, retryCount) => {
            const elapsed = initialTimestamp
                ? Date.now() - initialTimestamp
                : undefined
            // handle skip
            if (skip && skip(error)) {
                const retryError = 'Retries skipped'
                onRetryError && onRetryError(error, retryError)
                return throwError(() => error)
            }
            // handle no retries
            if (maxRetries === 0) {
                const retryError = 'Retries not allowed'
                onRetryError && onRetryError(error, retryError)
                return throwError(() => error)
            }
            // handle max retries
            if (maxRetries > 0 && retryCount >= maxRetries) {
                const retryError = `Max retries (${maxRetries}) exceeded${elapsed ? ` after ${elapsed}ms` : ''}`
                onRetryError && onRetryError(error, retryError)
                return throwError(() => error)
            }
            // handle timeout
            if (retryTimeout && elapsed && retryCount > minRetriesBeforeTimeout && elapsed > retryTimeout) {
                const retryError = `Timeout (${retryTimeout}) exceeded after ${retryCount} ${retryCount === 1 ? 'attempt' : 'attempts'}`
                onRetryError && onRetryError(error, retryError)
                return throwError(() => error)
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
