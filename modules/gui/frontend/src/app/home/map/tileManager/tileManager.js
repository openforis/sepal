import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {finalize, first, tap} from 'rxjs/operators'
import {getLogger} from 'log'
import {getTileManagerGroup} from './tileManagerGroup'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const log = getLogger('tileManager')

const stats = {
    in: 0,
    out: 0
}

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

    const requestIn = () => {
        stats.in++
        pending$.next(pending$.value + 1)
    }

    const requestOut = () => {
        stats.out++
        pending$.next(pending$.value - 1)
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject()
        const cancel$ = new Subject()
        const requestId = request.id
        log.debug(`Load tile ${requestTag({tileProviderId, requestId})}`)
        requestIn()
        submit({tileProviderId, requestId, request, response$, cancel$})
        return response$.pipe(
            first(),
            tap(() => requestOut()),
            finalize(() => {
                cancel$.next()
                log.trace(`Stats: in: ${stats.in}, out: ${stats.out}`)
            })
        )
    }

    const releaseTile = requestId => {
        log.debug(`Release tile ${requestTag({tileProviderId, requestId})}`)
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
