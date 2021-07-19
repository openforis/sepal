import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {finalize, first, tap} from 'rxjs/operators'
import {getLogger} from 'log'
import {getTileManagerGroup} from './tileManagerGroup'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

const requests = {}

export const getTileManager = tileProvider => {
    const {getTileProviderInfo, addTileProvider, removeTileProvider, submit, cancelByRequestId, setHidden} = getTileManagerGroup(tileProvider)

    const tileProviderId = uuid()
    const pending$ = new BehaviorSubject(0)

    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getType()
    }

    const getConcurrency = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getConcurrency()
    }

    const requestIn = requestId => {
        requests[requestId] = true
        pending$.next(pending$.value + 1)
    }

    const requestOut = requestId => {
        if (requests[requestId]) {
            delete requests[requestId]
            pending$.next(pending$.value - 1)
        }
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject()
        const cancel$ = new Subject()
        const requestId = request.id
        log.debug(`Load tile ${requestTag({tileProviderId, requestId})}`)
        requestIn(requestId)
        submit({tileProviderId, requestId, request, response$, cancel$})
        return response$.pipe(
            first(),
            tap(() => requestOut(requestId)),
            finalize(() => {
                cancel$.next()
                log.trace(`Pending tiles: ${Object.keys(requests).length}`)
            })
        )
    }

    const releaseTile = requestId => {
        log.debug(`Release tile ${requestTag({tileProviderId, requestId})}`)
        requestOut(requestId)
        cancelByRequestId(requestId)
    }

    const hide = hidden => {
        log.debug(`Set ${tileProviderTag(tileProviderId)} ${hidden ? 'hidden' : 'visible'}`)
        setHidden(tileProviderId, hidden)
    }

    const close = () => {
        log.debug('Close')
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
