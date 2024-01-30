import {TileProvider} from './tileProvider'
import {retry, throwError, timer} from 'rxjs'
import api from 'api'

const MAX_RETRIES = 5
const MIN_DELAY = 500
const MAX_DELAY = 30000
const DELAY_FACTOR = 2
const RETRY_TIMEOUT = 30000

export class WMTSTileProvider extends TileProvider {
    constructor({type, urlTemplate, tileSize, concurrency}) {
        super()
        this.type = type
        this.urlTemplate = urlTemplate
        this.tileSize = tileSize
        this.concurrency = concurrency
    }

    getType() {
        return this.type
    }

    getConcurrency() {
        return this.concurrency
    }
    
    loadTile$({x, y, zoom}) {
        const urlTemplate = this.urlTemplate
        const initialTimestamp = Date.now()
        return api.wmts.loadTile$({urlTemplate, x, y, zoom}).pipe(
            retry({
                delay: (error, retryCount) => {
                    const elapsed = Date.now() - initialTimestamp
                    if (elapsed > RETRY_TIMEOUT) {
                        return throwError(() => new Error(`${error.message} (timeout while retrying)`))
                    }
                    if (retryCount > MAX_RETRIES) {
                        return throwError(() => new Error(`${error.message} (too many retries)`))
                    }
                    const retryDelay = Math.min(MAX_DELAY, MIN_DELAY * Math.pow(DELAY_FACTOR, retryCount - 1))
                    return timer(retryDelay)
                }
            })
        )
    }
}
