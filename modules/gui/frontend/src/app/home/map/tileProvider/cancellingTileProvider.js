import {DelegatingTileProvider} from './delegatingTileProvider'
import {Subject} from 'rxjs'
import {filter, takeUntil} from 'rxjs/operators'

export class CancellingTileProvider extends DelegatingTileProvider {
    release$ = new Subject()
    close$ = new Subject()

    constructor(nextTileProvider) {
        super(nextTileProvider)
    }

    loadTile$(tileRequest) {
        const tile$ = super.loadTile$(tileRequest)
        const releaseTile$ = this.release$.pipe(
            filter(requestId => requestId === tileRequest.id)
        )
        return tile$.pipe(
            takeUntil(releaseTile$),
            takeUntil(this.close$)
        )
    }

    releaseTile(element) {
        super.releaseTile(element)
        this.release$.next(element.id)
    }

    close() {
        super.close()
        this.close$.next()
    }
}
