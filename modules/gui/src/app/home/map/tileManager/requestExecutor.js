import {finalize, first, takeUntil, tap} from 'rxjs'
import {getLogger} from '~/log'
import {tileProviderTag, tileTag} from '~/tag'
import _ from 'lodash'

const log = getLogger('tileManager/executor')

export const getRequestExecutor = ({tileResult$, concurrency}) => {
    const activeRequests = {} // by tileId
    const activeRequestCount = {} // by tileProviderId
    const hiddenTileProviders = {} // by tileProviderId
    const enabledTileProviders = {} // by tileProviderId

    const getActiveRequestCount = tileProviderId =>
        tileProviderId
            ? activeRequestCount[tileProviderId] || 0
            : Object.keys(activeRequests).length

    const increaseCount = tileProviderId => {
        const count = getActiveRequestCount(tileProviderId) + 1
        activeRequestCount[tileProviderId] = count
        return count
    }
        
    const decreaseCount = tileProviderId => {
        const count = getActiveRequestCount(tileProviderId) - 1
        activeRequestCount[tileProviderId] = count
        return count
    }
    
    const isAvailable = () =>
        getActiveRequestCount() < concurrency

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

    const logRequest = ({action, tileProviderId, tileId}) =>
        log.debug(() => [
            action,
            `${tileTag({tileProviderId, tileId})},`,
            `active: ${getActiveRequestCount(tileProviderId)}/${getActiveRequestCount()}`
        ].join(' '))

    const start = ({tileProviderId, tileId, request, response$, cancel$}) => {
        if (!activeRequests[tileId]) {
            const tile = {tileProviderId, tileId, request, response$, cancel$, timestamp: Date.now()}
            activeRequests[tileId] = tile
            increaseCount(tileProviderId)
            logRequest({tileProviderId, tileId, action: 'Started'})
            return tile
        } else {
            log.error(() => `Unexpected: cannot start already started ${tileTag({tileProviderId, tileId})}`)
        }
    }
    
    const finish = (tile, {nextTileProviderId}) => {
        const {tileProviderId, tileId} = tile
        if (activeRequests[tileId]) {
            delete activeRequests[tileId]
            decreaseCount(tileProviderId)
            if (nextTileProviderId) {
                tileResult$.next({tileProviderId, nextTileProviderIds: [nextTileProviderId], cancelledRequest: tile})
            } else {
                tileResult$.next({tileProviderId, nextTileProviderIds: getPriorityTileProviderIds(tileProviderId)})
            }
        } else {
            log.error(() => `Unexpected: cannot finish already finished ${tileTag({tileProviderId, tileId})}`)
        }
    }

    const execute = (tileProvider, tile) => {
        const {tileProviderId, tileId, request, response$, cancel$} = start(tile)
        const tileOptions = {}
        tileProvider.loadTile$(request).pipe(
            first(),
            takeUntil(
                cancel$.pipe(
                    tap(nextTileProviderId =>
                        tileOptions.nextTileProviderId = nextTileProviderId
                    )
                )
            ),
            finalize(() =>
                finish(tile, tileOptions)
            )
        ).subscribe({
            next: response => {
                log.debug(() => `Loaded ${tileTag({tileProviderId, tileId})}`, response)
                response$.next(response)
            },
            error: error => {
                log.error(() => `Failed ${tileTag({tileProviderId, tileId})}`, error)
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
    
    const tryCancelMostRecentByTileProviderId = (tileProviderId, nextTileProviderId, excludeCount) => {
        const request = getMostRecentByTileProviderId(tileProviderId, excludeCount)
        if (request) {
            log.debug(() => [
                'Replacing most recent request',
                `for ${isHidden(tileProviderId) ? 'hidden' : 'visible'} ${tileProviderTag(tileProviderId)}`,
                `with least recent request for ${tileProviderTag(nextTileProviderId)}`
            ].join(' '))
            request.cancel$.next(nextTileProviderId)
            return true
        }
        log.debug(() => `No cancellable request for ${tileProviderTag(tileProviderId)}`)
        return false
    }
    
    const tryCancelHidden = nextTileProviderId => {
        const maxActive = getMaxActive({hidden: true})
        if (maxActive) {
            return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, nextTileProviderId, 0)
        }
        return false
    }
    
    const tryCancelUnbalanced = nextTileProviderId => {
        const maxActive = getMaxActive({hidden: false})
        if (maxActive) {
            const activeCount = getActiveRequestCount(nextTileProviderId)
            const threshold = maxActive.count - 1
            if (activeCount < threshold) {
                log.debug(() => `Detected insufficient handlers for ${tileProviderTag(nextTileProviderId)}, currently ${activeCount} out of ${getActiveRequestCount()}`)
                return tryCancelMostRecentByTileProviderId(maxActive.tileProviderId, nextTileProviderId, 1)
            }
        }
        return false
    }

    const notify = ({tileProviderId, tileId}) => {
        log.debug(() => `Notified ${tileTag({tileProviderId, tileId})}`)
        if (isEnabled(tileProviderId)) {
            if (isAvailable()) {
                log.debug(() => `Accepted ${tileProviderTag(tileProviderId)}`)
                tileResult$.next({tileProviderId, nextTileProviderIds: [tileProviderId]})
            } else {
                if (!isHidden(tileProviderId)) {
                    const priority = tryCancelHidden(tileProviderId) || tryCancelUnbalanced(tileProviderId)
                    if (priority) {
                        log.debug(() => `Prioritized ${tileProviderTag(tileProviderId)}`)
                    } else {
                        log.debug(() => `Ignored non-priority ${tileProviderTag(tileProviderId)}`)
                    }
                }
            }
        } else {
            log.debug(() => `Ignored disabled ${tileProviderTag(tileProviderId)}`)
        }
    }

    const cancelRequest = request => {
        if (request && !request.response$.getValue()) {
            log.debug(() => `Cancelling ${tileTag(request)}`)
            request.cancel$.next()
            return true
        }
        return false
    }

    const cancelByTileId = tileId => {
        if (tileId) {
            const request = activeRequests[tileId]
            return cancelRequest(request)
        } else {
            log.warn('Cannot cancel as no request id was provided')
        }
        return false
    }

    const cancelByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const cancelledRequests = _(activeRequests)
                .values()
                .filter(request => request.tileProviderId === tileProviderId)
                .filter(request => cancelRequest(request))
                .value()
            if (cancelledRequests.length) {
                log.debug(() => `Cancelling ${cancelledRequests.length} for ${tileProviderTag(tileProviderId)}`)
            }
            return cancelledRequests
        } else {
            log.warn('Cannot cancel as no tileProvider id was provided')
        }
        return []
    }

    const setHidden = (tileProviderId, hidden) => {
        hiddenTileProviders[tileProviderId] = hidden
    }

    const isHidden = tileProviderId =>
        !!(hiddenTileProviders[tileProviderId])

    const setEnabled = (tileProviderId, enabled) => {
        enabledTileProviders[tileProviderId] = enabled
    }

    const isEnabled = tileProviderId =>
        !!(enabledTileProviders[tileProviderId])

    const removeTileProvider = tileProviderId => {
        cancelByTileProviderId(tileProviderId)
        delete activeRequestCount[tileProviderId]
        delete hiddenTileProviders[tileProviderId]
    }
    
    return {execute, notify, cancelByTileId, cancelByTileProviderId, removeTileProvider, setHidden, setEnabled, getActiveRequestCount}
}
