import {Subject} from 'rxjs'
import {finalize, first, takeUntil, tap} from 'rxjs/operators'
import {getLogger} from 'log'
import {requestTag, tileProviderTag} from './tag'
import _ from 'lodash'

const log = getLogger('tileManager')

export const getRequestExecutor = concurrency => {
    const finished$ = new Subject()

    const state = {
        activeRequests: {},
        activeRequestCount: {},
        hidden: {}
    }

    const getCount = tileProviderId =>
        tileProviderId
            ? state.activeRequestCount[tileProviderId] || 0
            : Object.keys(state.activeRequests).length

    const setCount = (tileProviderId, count) =>
        state.activeRequestCount[tileProviderId] = count

    const isAvailable = () =>
        getCount() < concurrency
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        state.activeRequests[requestId] = {tileProviderId, requestId, request, response$, cancel$, timestamp: Date.now()}
        const activeRequestCountByTileProviderId = getCount(tileProviderId) + 1
        setCount(tileProviderId, activeRequestCountByTileProviderId)
        log.debug(`Started ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
    }
    
    const finish = ({tileProviderId, requestId, currentRequest, replacementRequest}) => {
        delete state.activeRequests[requestId]
        const activeRequestCountByTileProviderId = getCount(tileProviderId) - 1
        setCount(tileProviderId, activeRequestCountByTileProviderId)
        log.debug(`Finished ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
        finished$.next({currentRequest, replacementRequest})
    }

    const getMostRecentByTileProviderId = (tileProviderId, excludeCount) => {
        const mostRecent = _(state.activeRequests)
            .pickBy(requestHandler => requestHandler.tileProviderId === tileProviderId)
            .values()
            .sortBy('timestamp')
            .slice(excludeCount) // keep a minimum of excludeCount
            .last() // get most recent of the remaining ones
        return mostRecent
    }

    const cancelMostRecentByTileProviderId = (tileProviderId, replacementRequest, excludeCount) => {
        const request = getMostRecentByTileProviderId(tileProviderId, excludeCount)
        if (request) {
            log.debug(`Cancelling lowest priority request handler for ${tileProviderTag(tileProviderId)}`)
            request.cancel$.next(replacementRequest)
            return true
        }
        console.warn(`Could not cancel request handler ${tileProviderTag(tileProviderId)}`)
        return false
    }

    const getMaxActive = filter => {
        const maxActive = _(state.activeRequestCount)
            .toPairs()
            .filter(([tileProviderId, _count]) => isHidden(tileProviderId) === filter.hidden)
            .sortBy(([_tileProviderId, count]) => count)
            .last()
        if (maxActive) {
            const [tileProviderId, count] = maxActive
            return {tileProviderId, count}
        }
        return null
    }

    const execute = (tileProvider, currentRequest) => {
        start(currentRequest)
        const {tileProviderId, requestId, request, response$, cancel$} = currentRequest
        const finishInfo = {tileProviderId, requestId}
        tileProvider.loadTile$(request).pipe(
            first(),
            takeUntil(cancel$.pipe(
                tap(replacementRequest => {
                    if (replacementRequest) {
                        finishInfo.currentRequest = currentRequest
                        finishInfo.replacementRequest = replacementRequest
                        log.debug(`Cancelled ${requestTag({tileProviderId, requestId})} for replacement with ${requestTag(replacementRequest)}`)
                    } else {
                        log.debug(`Cancelled ${requestTag({tileProviderId, requestId})}`)
                    }
                })
            )),
            finalize(() =>
                finish(finishInfo)
            ),
        ).subscribe({
            next: response => {
                log.debug(`Succeeded ${requestTag({tileProviderId, requestId})}`)
                response$.next(response)
                response$.complete()
            },
            error: error => {
                console.error(`Failed ${requestTag({tileProviderId, requestId})}`, error)
                response$.error(error)
            }
        })
    }

    const isHidden = tileProviderId =>
        !!(state.hidden[tileProviderId])

    const tryCancelHidden = replacementRequest => {
        const maxActive = getMaxActive({hidden: true})
        if (maxActive) {
            return cancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementRequest, 0)
        }
        return false
    }
    
    const tryCancelUnbalanced = replacementRequest => {
        const maxActive = getMaxActive({hidden: false})
        if (maxActive) {
            const {tileProviderId} = replacementRequest
            const activeCount = getCount(tileProviderId)
            const threshold = maxActive.count - 1
            if (activeCount < threshold) {
                log.debug(`Detected insufficient handlers for ${tileProviderTag(tileProviderId)}, currently ${activeCount}`)
                return cancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementRequest, 1)
            }
        }
        return false
    }

    const notify = ({tileProviderId, requestId}) => {
        if (getCount() && !isHidden(tileProviderId)) {
            tryCancelHidden({tileProviderId, requestId}) || tryCancelUnbalanced({tileProviderId, requestId})
        }
    }

    const cancel = requestId => {
        const request = state.activeRequests[requestId]
        if (request) {
            request.cancel$.next()
        }
    }

    const hidden = (tileProviderId, hidden) => {
        state.hidden[tileProviderId] = hidden
    }

    return {isAvailable, execute, notify, cancel, hidden, finished$}
}
