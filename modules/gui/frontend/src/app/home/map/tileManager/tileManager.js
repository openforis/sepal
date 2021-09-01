import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {finalize, first} from 'rxjs/operators'
import {getLogger} from 'log'
import {getTileManagerGroup} from './tileManagerGroup'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

export const getTileManager = tileProvider => {
    const {getTileProvider, addTileProvider, removeTileProvider, submit, cancelByRequestId, setHidden, getStats} = getTileManagerGroup(tileProvider)

    const tileProviderId = uuid()
    const pending$ = new BehaviorSubject(0)

    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProvider(tileProviderId).getType()
    }

    const getConcurrency = () => {
        return getTileProvider(tileProviderId).getConcurrency()
    }

    const reportPending = () => {
        const tileProviderStats = getStats(tileProviderId)
        pending$.next(tileProviderStats.pending)
        log.debug(() => `${tileProviderTag(tileProviderId)}: ${tileProviderStats.msg}`)
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject()
        const cancel$ = new Subject()
        const requestId = request.id
        log.debug(() => `Load tile ${requestTag({tileProviderId, requestId})}`)
        submit({tileProviderId, requestId, request, response$, cancel$})
        reportPending()
        return response$.pipe(
            first(),
            finalize(() => {
                cancel$.next()
                reportPending()
            })
        )
    }

    const releaseTile = requestId => {
        log.debug(() => `Release tile ${requestTag({tileProviderId, requestId})}`)
        reportPending()
        cancelByRequestId(requestId)
    }

    const hide = hidden => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${hidden ? 'hidden' : 'visible'}`)
        setHidden(tileProviderId, hidden)
    }

    const close = () => {
        log.debug(() => 'Close')
        removeTileProvider(tileProviderId)
    }

    return {
        getType,
        getConcurrency,
        loadTile$,
        releaseTile,
        hide,
        pending$,
        close
    }
}
