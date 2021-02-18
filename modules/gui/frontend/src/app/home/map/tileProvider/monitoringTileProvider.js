import {BehaviorSubject} from 'rxjs'
import {DelegatingTileProvider} from './delegatingTileProvider'
import {debounceTime, finalize} from 'rxjs/operators'

export class MonitoringTileProvider extends DelegatingTileProvider {
    constructor(nextTileProvider, progress$) {
        super(nextTileProvider)
        this.pending$ = new BehaviorSubject(0)
        this.pending$.pipe(
            debounceTime(200)
        ).subscribe(
            pending => progress$ && progress$.next({loading: pending})
        )
        this.requests = {}
    }

    loadTile$(tileRequest) {
        this.pending$.next(this.pending$.value + 1)
        return super.loadTile$(tileRequest).pipe(
            finalize(() => {
                this.requests[tileRequest.id] = true
                this.pending$.next(this.pending$.value - 1)
            })
        )
    }

    releaseTile(requestId) {
        if (!this.requests[requestId]) {
            super.releaseTile(requestId)
            this.pending$.next(this.pending$.value - 1)
        }
        delete this.requests[requestId]
    }
}
