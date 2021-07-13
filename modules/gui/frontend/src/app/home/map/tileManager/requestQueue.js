import {getLogger} from 'log'
import {requestTag, tileProviderTag} from 'tag'
import _ from 'lodash'

const log = getLogger('tileManager/queue')

export const getRequestQueue = () => {
    const pendingRequests = []

    const getCount = () => {
        return pendingRequests.length
    }
    
    const isEmpty = () => {
        return getCount() === 0
    }

    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        log.debug(`Enqueued ${requestTag({tileProviderId, requestId})}, currently pending: ${getCount()}`)
    }

    const dequeueFIFO = () => {
        const pendingRequest = pendingRequests.shift()
        log.debug(`Dequeued ${requestTag(pendingRequest)}, currently pending: ${getCount()}`)
        return pendingRequest
    }

    const dequeueByRequestId = requestId => {
        if (requestId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.requestId === requestId)
            if (index !== -1) {
                return dequeueByIndex(index, 'requestId')
            }
        }
        log.warn(`Could not dequeue ${requestTag({requestId})}, reverting to FIFO`)
        return dequeueFIFO()
    }

    const dequeueByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.tileProviderId === tileProviderId)
            if (index !== -1) {
                return dequeueByIndex(index, 'tileProviderId')
            }
        }
        log.debug(`Could not dequeue ${tileProviderTag({tileProviderId})}, reverting to FIFO`)
        return dequeueFIFO()
    }

    const dequeueByIndex = (index, dequeueMode = '') => {
        if (index !== -1) {
            const [pendingRequest] = pendingRequests.splice(index, 1)
            log.debug(`Dequeued by ${dequeueMode} ${requestTag(pendingRequest)} - currently pending: ${getCount()}`)
            return pendingRequest
        }
        log.warn(`Could not dequeue by ${dequeueMode}, reverting to FIFO`)
        return dequeueFIFO()
    }

    const removeByRequestId = requestId => {
        if (requestId) {
            const index = _.findIndex(pendingRequests, pendingRequest => pendingRequest.requestId === requestId)
            if (index !== -1) {
                const [pendingRequest] = pendingRequests.splice(index, 1)
                log.debug(`Removed ${requestTag(pendingRequest)} - currently pending: ${getCount()}`)
                return true
            }
        } else {
            log.warn('Cannot remove as no request id was provided')
        }
        return false
    }

    const removeByTileProviderId = tileProviderId => {
        if (tileProviderId) {
            const removed = _(pendingRequests)
                .filter(request => request.tileProviderId === tileProviderId)
                .reduce((count, request) => count + (removeByRequestId(request.requestId) ? 1 : 0), 0)
            log.debug(`Removed ${removed} for ${tileProviderTag({tileProviderId})} - currently pending: ${getCount()}`)
        } else {
            log.warn('Cannot remove as no tileProvider id was provided')
        }
    }

    const scan = callback =>
        pendingRequests.forEach(callback)

    return {isEmpty, enqueue, dequeueByRequestId, dequeueByTileProviderId, removeByRequestId, removeByTileProviderId, scan}
}
