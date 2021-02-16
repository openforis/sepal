import {Subject} from 'rxjs'
import {finalize, first, takeUntil, tap} from 'rxjs/operators'
import {requestTag, tileProviderTag} from './tag'
import _ from 'lodash'

export const getRequestExecutor = concurrency => {
    const activeRequests = {}
    const activeRequestCount = {}

    const started$ = new Subject()
    const finished$ = new Subject()

    const getCount = tileProviderId =>
        tileProviderId
            ? activeRequestCount[tileProviderId] || 0
            : Object.keys(activeRequests).length

    const setCount = (tileProviderId, count) =>
        activeRequestCount[tileProviderId] = count

    const isAvailable = () =>
        getCount() < concurrency
    
    const start = ({tileProviderId, requestId, request, response$, cancel$}) => {
        activeRequests[requestId] = {tileProviderId, requestId, request, response$, cancel$, timestamp: Date.now()}
        const activeRequestCountByTileProviderId = getCount(tileProviderId) + 1
        setCount(tileProviderId, activeRequestCountByTileProviderId)
        console.log(`Started ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
        started$.next({tileProviderId, requestId})
    }
    
    const finish = ({tileProviderId, requestId, currentRequest, replacementRequest}) => {
        delete activeRequests[requestId]
        const activeRequestCountByTileProviderId = getCount(tileProviderId) - 1
        setCount(tileProviderId, activeRequestCountByTileProviderId)
        console.log(`Finished ${requestTag({tileProviderId, requestId})}, active: ${activeRequestCountByTileProviderId}/${getCount()}`)
        finished$.next({tileProviderId, requestId, currentRequest, replacementRequest})
    }

    const getMostRecentByTileProviderId = tileProviderId => {
        const mostRecent = _(activeRequests)
            .pickBy(requestHandler => requestHandler.tileProviderId === tileProviderId)
            .values()
            .sortBy('timestamp')
            .tail() // exclude first, to keep at least one
            .last() // get most recent of the remaining ones
        return mostRecent
    }

    const cancelMostRecentByTileProviderId = (tileProviderId, replacementRequest) => {
        const request = getMostRecentByTileProviderId(tileProviderId)
        if (request) {
            console.log(`Cancelling lowest priority request handler for ${tileProviderTag(tileProviderId)}`)
            request.cancel$.next(replacementRequest)
        } else {
            console.warn(`Could not cancel request handler ${tileProviderTag(tileProviderId)}`)
        }
    }

    const getMaxActive = () => {
        const [tileProviderId, count] = _(activeRequestCount)
            .toPairs()
            .sortBy(([_tileProviderId, count]) => count)
            .last()
        return {tileProviderId, count}
    }

    const notify = ({tileProviderId, requestId}) => {
        if (getCount()) {
            // if tileProviderId has not enough active requests, look for the tileProvider with
            // the highest number of active requests and cancel the most recent one
            const maxActive = getMaxActive()
            const activeCount = getCount(tileProviderId)
            const threshold = maxActive.count - 1
            if (activeCount < threshold) {
                console.log(`Detected insufficient handlers for ${tileProviderTag(tileProviderId)}, currently ${activeCount}`)
                cancelMostRecentByTileProviderId(maxActive.tileProviderId, {tileProviderId, requestId})
            }
        }
    }

    const cancel = requestId => {
        const request = activeRequests[requestId]
        if (request) {
            request.cancel$.next()
        }
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
                        console.log(`Cancelled ${requestTag({tileProviderId, requestId})} for replacement with ${requestTag(replacementRequest)}`)
                    } else {
                        console.log(`Cancelled ${requestTag({tileProviderId, requestId})}`)
                    }
                })
            )),
            finalize(() =>
                finish(finishInfo)
            ),
        ).subscribe({
            next: response => {
                console.log(`Succeeded ${requestTag({tileProviderId, requestId})}`)
                response$.next(response)
                response$.complete()
            },
            error: error => {
                console.error(`Failed ${requestTag({tileProviderId, requestId})}`, error)
                response$.error(error)
            }
        })
    }
    
    return {isAvailable, execute, notify, cancel, started$, finished$}
}
