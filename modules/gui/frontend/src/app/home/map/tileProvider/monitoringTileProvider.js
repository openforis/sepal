import {DelegatingTileProvider} from './delegatingTileProvider'
import {Subject} from 'rxjs'
import {finalize, scan} from 'rxjs/operators'

export class MonitoringTileProvider extends DelegatingTileProvider {
    constructor(nextTileProvider, progress$) {
        super()
        this.nextTileProvider = nextTileProvider
        this.requestById = {}
        this.pending$ = new Subject()
        this.pending$.pipe(
            scan((pending, current) => pending += current)
        ).subscribe(
            pending => progress$ && progress$.next({loading: pending})
        )
    }

    addRequest(requestId) {
        this.requestById[requestId] = Date.now()
        this.pending$.next(1)
    }

    removeRequest(requestId) {
        delete this.requestById[requestId]
        this.pending$.next(-1)
    }

    loadTile$(tileRequest) {
        const requestId = tileRequest.id
        this.addRequest(requestId)
        return this.nextTileProvider.loadTile$(tileRequest).pipe(
            finalize(() => this.removeRequest(requestId))
        )
    }

    releaseTile(tileElement) {
        return this.nextTileProvider.releaseTile(tileElement)
    }
}
