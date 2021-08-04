import {assertValue} from 'assertValue'
import {getLogger} from 'log'
import {requestTag, tileProviderTag} from 'tag'
import _ from 'lodash'

const log = getLogger('tileManager/queue')

export const getRequestQueue = () => {
    const pendingRequests = []
    const pendingRequestCount = {} // by tileProviderId

    const getCount = tileProviderId =>
        tileProviderId
            ? pendingRequestCount[tileProviderId] || 0
            : pendingRequests.length

    const increaseCount = tileProviderId => {
        const count = getCount(tileProviderId) + 1
        pendingRequestCount[tileProviderId] = count
        return count
    }
    
    const decreaseCount = tileProviderId => {
        const count = getCount(tileProviderId) - 1
        pendingRequestCount[tileProviderId] = count
        return count
    }
    
    const isEmpty = () => {
        return getCount() === 0
    }

    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        assertValue(tileProviderId, _.isString, 'tileProviderId must be provided', true)
        assertValue(requestId, _.isString, 'requestId must be provided', true)
        assertValue(request, _.isObject, 'request must be provided', true)
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        increaseCount(tileProviderId)
        log.debug(() => `Enqueued ${requestTag({tileProviderId, requestId})}, currently pending: ${getCount()}`)
    }

    const dequeueFIFO = () => {
        const pendingRequest = pendingRequests.shift()
        const tileProviderId = pendingRequest.tileProviderId
        decreaseCount(tileProviderId)
        log.debug(() => `Dequeued ${requestTag(pendingRequest)}, currently pending: ${getCount()}`)
        return pendingRequest
    }

    const dequeueByIndex = (index, dequeueMode = '') => {
        if (index !== -1) {
            const [pendingRequest] = pendingRequests.splice(index, 1)
            const tileProviderId = pendingRequest.tileProviderId
            decreaseCount(tileProviderId)
            log.debug(() => `Dequeued by ${dequeueMode} ${requestTag(pendingRequest)} - currently pending: ${getCount()}`)
            return pendingRequest
        }
        log.warn(`Could not dequeue by ${dequeueMode}, reverting to FIFO`)
        return dequeueFIFO()
    }

    const dequeueByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.tileProviderId === tileProviderId)
            if (index !== -1) {
                return dequeueByIndex(index, 'tileProviderId')
            }
        }
        log.debug(() => `Could not dequeue ${tileProviderTag({tileProviderId})}, reverting to FIFO`)
        return dequeueFIFO()
    }

    const discardByRequestId = requestId => {
        if (requestId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.requestId === requestId)
            if (index !== -1) {
                return !!dequeueByIndex(index, 'requestId (discarded)')
            }
        } else {
            log.warn('Cannot remove as no request id was provided')
        }
        return false
    }

    const discardByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const removed = _(pendingRequests)
                .filter(request => request.tileProviderId === tileProviderId)
                .reduce((count, request) => count + (discardByRequestId(request.requestId) ? 1 : 0), 0)
            log.debug(() => `Removed ${removed} for ${tileProviderTag({tileProviderId})} - currently pending: ${getCount()}`)
        } else {
            log.warn('Cannot remove as no tileProvider id was provided')
        }
    }

    const scan = callback =>
        pendingRequests.forEach(callback)

    const removeTileProvider = tileProviderId => {
        discardByTileProviderId(tileProviderId)
        delete pendingRequestCount[tileProviderId]
    }

    return {isEmpty, enqueue, dequeueByTileProviderIds, discardByRequestId, removeTileProvider, scan, getCount}
}
