import {TileProvider} from './tileProvider'
import {getTileManager} from '../tileManager/tileManager'
import {mergeMap, of, pipe, range, retryWhen, switchMap, throwError, timer, zip} from 'rxjs'

export class BalancingTileProvider extends TileProvider {
    constructor({tileProvider, retries, busy$, renderingEnabled$, renderingStatus$}) {
        super()
        this.subscriptions = []
        this.retries = retries
        this.tileProvider = tileProvider
        this.tileManager = getTileManager({tileProvider, renderingEnabled$})
        this.initProgress(busy$, renderingStatus$)
    }

    initProgress(busy$, renderingStatus$) {
        if (busy$ || renderingStatus$) {
            this.subscriptions.push(
                this.tileManager.status$.subscribe({
                    next: ({tileProviderId, pending, pendingEnabled}) => {
                        busy$?.next(pendingEnabled)
                        renderingStatus$?.next({tileProviderId, pending})
                    }
                })
            )
        }
    }

    getType() {
        return this.tileProvider.getType()
    }

    getConcurrency() {
        return this.tileProvider.getConcurrency()
    }

    loadTile$(tileRequest) {
        return of(true).pipe(
            switchMap(() => this.tileManager.loadTile$(tileRequest)),
            retry(this.retries, {description: tileRequest.id}),
        )
    }

    createElement(id, doc) {
        return this.tileProvider.createElement(id, doc)
    }

    renderTile({element, blob}) {
        this.tileProvider.renderTile({element, blob})
    }

    releaseTile(element) {
        this.tileManager.releaseTile(element.id)
        this.tileProvider.releaseTile(element)
    }

    setVisibility(visible) {
        this.tileManager.setVisibility(visible)
    }

    close() {
        this.tileManager.close()
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
        this.tileProvider.close()
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
                        return throwError(() => error)
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
