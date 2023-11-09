import {assertValue} from 'assertValue'
import {getLogger} from 'log'
import {requestTag, tileProviderTag} from 'tag'
import _ from 'lodash'

const log = getLogger('tileManager/queue')

export const getRequestQueue = () => {
    const pendingRequests = []
    const pendingRequestCount = {} // by tileProviderId
    const tileProvidersStatus = {} // by tileProviderId

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
        const count = Object.keys(tileProvidersStatus)
            .filter(tileProviderId => isEnabled(tileProviderId))
            .reduce((acc, tileProviderId) => acc + getCount(tileProviderId), 0)
        return count === 0
    }

    const isEnabled = tileProviderId =>
        tileProviderId && tileProvidersStatus[tileProviderId]

    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        assertValue(tileProviderId, _.isString, 'tileProviderId must be provided', true)
        assertValue(requestId, _.isString, 'requestId must be provided', true)
        assertValue(request, _.isObject, 'request must be provided', true)
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        increaseCount(tileProviderId)
        log.debug(() => `Enqueued ${requestTag({tileProviderId, requestId})}, enqueued: ${getCount()}`)
    }

    const dequeueByIndex = (index, dequeueMode = '') => {
        if (index !== -1 && index < pendingRequests.length) {
            const [pendingRequest] = pendingRequests.splice(index, 1)
            const tileProviderId = pendingRequest.tileProviderId
            if (isEnabled(tileProviderId)) {
                decreaseCount(tileProviderId)
                log.debug(() => `Dequeued by ${dequeueMode} ${requestTag(pendingRequest)}, enqueued: ${getCount()}`)
                return pendingRequest
            }
        }
        return null
    }

    const dequeueFIFO = () => {
        if (pendingRequests.length) {
            const index = pendingRequests.findIndex(({tileProviderId}) => isEnabled(tileProviderId))
            return dequeueByIndex(index, 'FIFO')
        }
        return null
    }

    const dequeueByTileProviderId = tileProviderId => {
        if (isEnabled(tileProviderId)) {
            const index = pendingRequests.findIndex(request => request.tileProviderId === tileProviderId)
            return dequeueByIndex(index, tileProviderTag(tileProviderId))
        }
        return null
    }

    const dequeueByTileProviderIds = ([tileProviderId, ...tileProviderIds]) =>
        dequeueByTileProviderId(tileProviderId)
            || (tileProviderIds.length && dequeueByTileProviderIds(tileProviderIds))
            || dequeueFIFO()

    const discardByRequestId = requestId => {
        if (requestId) {
            const index = pendingRequests.findIndex(pendingRequest => pendingRequest.requestId === requestId)
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
            log.debug(() => `Removed ${removed} for ${tileProviderTag(tileProviderId)}, enqueued: ${getCount()}`)
        } else {
            log.warn('Cannot remove as no tileProvider id was provided')
        }
    }

    const scan = callback =>
        pendingRequests.forEach(callback)

    const removeTileProvider = tileProviderId => {
        discardByTileProviderId(tileProviderId)
        delete pendingRequestCount[tileProviderId]
        delete tileProvidersStatus[tileProviderId]
    }

    const setEnabled = (tileProviderId, enabled) => {
        tileProvidersStatus[tileProviderId] = enabled
    }

    return {isEmpty, enqueue, dequeueByTileProviderIds, discardByRequestId, removeTileProvider, scan, getCount, setEnabled}
}
