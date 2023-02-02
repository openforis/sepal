import {Subject, finalize, first, takeUntil, tap} from 'rxjs'
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

    const getPriorityTileProviderIds = tileProviderId => {
        const priorityTileProviderIds = _(activeRequestCount)
            .toPairs()
            .sortBy([
                ([tileProviderId, _count]) => isHidden(tileProviderId), // sort by visibility (visible first)
                ([_tileProviderId, count]) => count                     // sort by count (lowest first)
            ])
            .map(([tileProviderId, _count]) => tileProviderId)
            .value()
        const tileProviderIds = _.uniq([tileProviderId, ...priorityTileProviderIds])
        log.debug(() => 'Priority tile providers: ', tileProviderIds.map(tileProviderId => tileProviderTag(tileProviderId)))
        return tileProviderIds
    }
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        if (!activeRequests[requestId]) {
            activeRequests[requestId] = {tileProviderId, requestId, request, response$, cancel$, timestamp: Date.now()}
            const activeRequestCountByTileProviderId = increaseCount(tileProviderId)
            log.debug(() => `Started ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
        } else {
            log.warn(() => `Cannot start already started ${requestTag({tileProviderId, requestId})}`)
        }
    }
    
    const finish = ({currentRequest, replacementTileProviderId}) => {
        const {tileProviderId, requestId, complete} = currentRequest
        if (activeRequests[requestId]) {
            delete activeRequests[requestId]
            const activeRequestCountByTileProviderId = decreaseCount(tileProviderId)
            if (complete) {
                log.debug(() => `Completed ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
            } else {
                log.debug(() => `Aborted ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
            }
            if (replacementTileProviderId) {
                setTimeout(() => finished$.next({currentRequest, replacementTileProviderId}))
            } else {
                const priorityTileProviderIds = getPriorityTileProviderIds(tileProviderId)
                setTimeout(() => finished$.next({currentRequest, priorityTileProviderIds}))
            }
        } else {
            log.warn(() => `Cannot finish already finished ${requestTag({tileProviderId, requestId})}`)
        }
    }

    const execute = (tileProvider, currentRequest) => {
        start(currentRequest)
        const {tileProviderId, requestId, request, response$, cancel$} = currentRequest
        const finishInfo = {currentRequest}
        tileProvider.loadTile$(request).pipe(
            first(),
            takeUntil(
                cancel$.pipe(
                    tap(replacementTileProviderId =>
                        finishInfo.replacementTileProviderId = replacementTileProviderId
                    )
                )
            ),
            finalize(() =>
                finish(finishInfo)
            )
        ).subscribe({
            next: response => {
                currentRequest.complete = true
                response$.next(response)
            },
            error: error => {
                log.error(() => `Failed ${requestTag({tileProviderId, requestId})}`, error)
                response$.error(error)
            }
        })
    }

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
    
    const tryCancelMostRecentByTileProviderId = (tileProviderId, replacementTileProviderId, excludeCount) => {
        const request = getMostRecentByTileProviderId(tileProviderId, excludeCount)
        if (request) {
            log.debug(() => [
                'Replacing most recent request',
                `for ${isHidden(tileProviderId) ? 'hidden' : 'visible'} ${tileProviderTag(tileProviderId)}`,
                `with least recent request for ${tileProviderTag(replacementTileProviderId)}`
            ].join(' '))
            request.cancel$.next(replacementTileProviderId)
            return true
        }
        log.debug(() => `No cancellable request for ${tileProviderTag(tileProviderId)}`)
        return false
    }
    
    const tryCancelHidden = replacementTileProviderId => {
        const maxActive = getMaxActive({hidden: true})
        if (maxActive) {
            return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementTileProviderId, 0)
        }
        return false
    }
    
    const tryCancelUnbalanced = replacementTileProviderId => {
        const maxActive = getMaxActive({hidden: false})
        if (maxActive) {
            const activeCount = getCount(replacementTileProviderId)
            const threshold = maxActive.count - 1
            if (activeCount < threshold) {
                log.debug(() => `Detected insufficient handlers for ${tileProviderTag(replacementTileProviderId)}, currently ${activeCount} out of ${getCount()}`)
                return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, replacementTileProviderId, 1)
            }
        }
        return false
    }

    const notify = ({tileProviderId, requestId}) => {
        if (getCount() && !isHidden(tileProviderId)) {
            log.debug(() => `Notified ${requestTag({tileProviderId, requestId})}`)
            const priority = tryCancelHidden(tileProviderId) || tryCancelUnbalanced(tileProviderId)
            if (priority) {
                log.debug(() => `Prioritized ${tileProviderTag(tileProviderId)}`)
            } else {
                log.debug(() => `Ignored non-priority ${tileProviderTag(tileProviderId)}`)
            }
        }
    }

    const cancelByRequestId = requestId => {
        if (requestId) {
            const request = activeRequests[requestId]
            if (request) {
                if (!request.complete) {
                    log.debug(() => `Cancelling ${requestTag(request)}`)
                    request.cancel$.next()
                }
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

    const isHidden = tileProviderId =>
        !!(hiddenTileProviders[tileProviderId])

    const removeTileProvider = tileProviderId => {
        cancelByTileProviderId(tileProviderId)
        delete activeRequestCount[tileProviderId]
        delete hiddenTileProviders[tileProviderId]
    }
    
    return {isAvailable, execute, notify, cancelByRequestId, removeTileProvider, setHidden, finished$, getCount}
}
