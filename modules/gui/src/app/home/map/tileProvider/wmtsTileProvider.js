import {TileProvider} from './tileProvider'
import {retry, throwError, timer} from 'rxjs'
import api from 'api'

const MAX_ATTEMPTS = 5
const MIN_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 30000
const RETRY_DELAY_FACTOR = 2
const RETRY_TIMEOUT_MS = 30000

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
                    if (elapsed > RETRY_TIMEOUT_MS) {
                        return this.handleError$(error, `Retry time limit (${RETRY_TIMEOUT_MS}ms) exceeded after ${retryCount} ${retryCount === 1 ? 'attempt' : 'attempts'}`)
                    }
                    if (retryCount >= MAX_ATTEMPTS) {
                        return this.handleError$(error, `Max number of attempts (${MAX_ATTEMPTS}) exceeded after ${elapsed}ms`)
                    }
                    const retryDelay = Math.min(MAX_RETRY_DELAY_MS, MIN_RETRY_DELAY_MS * Math.pow(RETRY_DELAY_FACTOR, retryCount - 1))
                    return timer(retryDelay)
                }
            })
        )
    }

    handleError$(error, retryError) {
        return throwError(() => `${error} (${retryError})`)
    }
}
