import {DelegatingTileProvider} from './delegatingTileProvider'
import {mergeMap, retryWhen, switchMap} from 'rxjs/operators'
import {of, pipe, range, throwError, timer, zip} from 'rxjs'

export class RetryingTileManager extends DelegatingTileProvider {
    constructor(retries, nextTileProvider) {
        super(nextTileProvider)
        this.retries = retries
    }

    loadTile$(tileRequest) {
        return of(true).pipe(
            switchMap(() => super.loadTile$(tileRequest)),
            retry(this.retries, {description: tileRequest.id}),
        )
    }
}

const retry = (maxRetries, {minDelay = 500, maxDelay = 30000, exponentiality = 2, description} = {}) => pipe(
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
                        console.error(`Retrying ${description ? `${description} ` : ''}(${retry}/${maxRetries}) in ${cappedExponentialBackoff}ms after error: ${error}`)
                        return timer(cappedExponentialBackoff)
                    }
                }
            )
        )
    )
)
