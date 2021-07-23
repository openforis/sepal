import {Subject} from 'rxjs'
import {finalize, first, takeUntil, tap} from 'rxjs/operators'
import {getLogger} from 'log'
import {requestTag, tileProviderTag} from 'tag'
import _ from 'lodash'

const log = getLogger('tileManager/executor')

export const getRequestExecutor = concurrency => {
    const finished$ = new Subject()

    const activeRequests = {} // by requestId
    const activeRequestCount = {} // by tileProviderId
    const hiddenTileProviders = {} // by tileProviderId

    const getCount = tileProviderId =>
        tileProviderId
            ? activeRequestCount[tileProviderId] || 0
            : Object.keys(activeRequests).length

    const increaseCount = tileProviderId => {
        const count = getCount(tileProviderId) + 1
        activeRequestCount[tileProviderId] = count
        return count
    }
        
    const decreaseCount = tileProviderId => {
        const count = getCount(tileProviderId) - 1
        activeRequestCount[tileProviderId] = count
        return count
    }
    
    const isAvailable = () =>
        getCount() < concurrency
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        activeRequests[requestId] = {tileProviderId, requestId, request, response$, cancel$, timestamp: Date.now()}
        const activeRequestCountByTileProviderId = increaseCount(tileProviderId)
        log.debug(() => `Started ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
    }
    
    const finish = ({tileProviderId, requestId, currentRequest, replacementRequest}) => {
        delete activeRequests[requestId]
        const activeRequestCountByTileProviderId = decreaseCount(tileProviderId)
        log.debug(() => `Finished ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
        finished$.next({tileProviderId, currentRequest, replacementRequest})
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
                        log.debug(() => `Replacing ${requestTag({tileProviderId, requestId})} with ${requestTag(replacementRequest)}`)
                    }
                })
            )),
            finalize(() =>
                finish(finishInfo)
            ),
        ).subscribe({
            next: response => {
                log.debug(() => `Succeeded ${requestTag({tileProviderId, requestId})}`)
                response$.next(response)
                response$.complete()
            },
            error: error => {
                log.error(() => `Failed ${requestTag({tileProviderId, requestId})}`, error)
                response$.error(error)
            }
        })
    }

    const isHidden = tileProviderId =>
        !!(hiddenTileProviders[tileProviderId])

    const getMaxActive = filter => {
        const maxActive = _(activeRequestCount)
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
    
    const getMostRecentByTileProviderId = (tileProviderId, excludeCount) => {
        const mostRecent = _(activeRequests)
            .pickBy(requestHandler => requestHandler.tileProviderId === tileProviderId)
            .values()
            .sortBy('timestamp')
            .slice(excludeCount) // keep a minimum of excludeCount
            .last() // get most recent of the remaining ones
        return mostRecent
    }
    
    const tryCancelMostRecentByTileProviderId = (tileProviderId, replacementRequest, excludeCount) => {
        const request = getMostRecentByTileProviderId(tileProviderId, excludeCount)
        if (request) {
            log.debug(() => `Cancelling lowest priority request handler for ${tileProviderTag(tileProviderId)}`)
            request.cancel$.next(replacementRequest)
            return true
        }
        log.debug(() => `No cancellable request for ${tileProviderTag(tileProviderId)}`)
        return false
    }
    
    const tryCancelHidden = replacementRequest => {
        const maxActive = getMaxActive({hidden: true})
        if (maxActive) {
            return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementRequest, 0)
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
                log.debug(() => `Detected insufficient handlers for ${tileProviderTag(tileProviderId)}, currently ${activeCount} out of ${getCount()}`)
                return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementRequest, 1)
            }
        }
        return false
    }

    const notify = ({tileProviderId, requestId}) => {
        if (getCount() && !isHidden(tileProviderId)) {
            log.debug(() => `Trying to start ${requestTag({tileProviderId, requestId})}`)
            tryCancelHidden({tileProviderId, requestId}) || tryCancelUnbalanced({tileProviderId, requestId})
        }
    }

    const cancelByRequestId = requestId => {
        if (requestId) {
            const request = activeRequests[requestId]
            if (request) {
                log.debug(() => `Cancelling ${requestTag(request)}`)
                request.cancel$.next()
                return true
            }
        } else {
            log.warn('Cannot cancel as no request id was provided')
        }
        return false
    }

    const cancelByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const cancelling = _(activeRequests)
                .values()
                .filter(request => request.tileProviderId === tileProviderId)
                .reduce((count, request) => count + (cancelByRequestId(request.requestId) ? 1 : 0), 0)
            if (cancelling) {
                log.debug(() => `Cancelling ${cancelling} for ${tileProviderTag(tileProviderId)}`)
            }
        } else {
            log.warn('Cannot cancel as no tileProvider id was provided')
        }
    }

    const setHidden = (tileProviderId, hidden) => {
        hiddenTileProviders[tileProviderId] = hidden
    }

    return {isAvailable, execute, notify, cancelByRequestId, cancelByTileProviderId, setHidden, finished$, getCount}
}
