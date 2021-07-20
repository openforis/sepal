import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {finalize, first} from 'rxjs/operators'
import {getLogger} from 'log'
import {getTileManagerGroup} from './tileManagerGroup'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

export const getTileManager = tileProvider => {
    const {getTileProviderInfo, addTileProvider, removeTileProvider, submit, cancelByRequestId, setHidden, getCount} = getTileManagerGroup(tileProvider)

    const tileProviderId = uuid()
    const pending$ = new BehaviorSubject(0)

    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getType()
    }

    const getConcurrency = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getConcurrency()
    }

    const reportPending = () => {
        const tileProviderCount = getCount(tileProviderId)
        const overallCount = getCount()
        const pending = tileProviderCount.enqueued + tileProviderCount.executing
        pending$.next(pending)
        log.trace(`${tileProviderTag(tileProviderId)}: enqueued: ${tileProviderCount.enqueued}/${overallCount.enqueued}, executing: ${tileProviderCount.executing}/${overallCount.executing}`)
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject()
        const cancel$ = new Subject()
        const requestId = request.id
        log.debug(`Load tile ${requestTag({tileProviderId, requestId})}`)
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
        log.debug(`Release tile ${requestTag({tileProviderId, requestId})}`)
        reportPending()
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
