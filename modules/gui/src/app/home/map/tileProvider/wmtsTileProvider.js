import {TileProvider} from './tileProvider'
import {autoRetry} from 'rxjsutils'
import _ from 'lodash'
import api from 'api'

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2,
    minRetriesBeforeTimeout: 1,
    retryTimeout: 30000,
}

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
            autoRetry(
                _.merge({}, DEFAULT_RETRY_CONFIG, {
                    initialTimestamp,
                    onError$: (error, retryError) => this.handleError$(error, retryError)
                })
            )
        )
    }

    handleError$(_error, _retryError) {
        this.abstractMethodError('handleError$')
    }
}
