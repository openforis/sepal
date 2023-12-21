import {assertValue} from 'assertValue'
import {getLogger} from 'log'
import {requestTag, tileProviderTag} from 'tag'
import _ from 'lodash'

const log = getLogger('tileManager/queue')

export const getRequestQueue = () => {
    const pendingRequests = []
    const tileProvidersStatus = {} // by tileProviderId

    const getEnabledRequests = () =>
        pendingRequests.filter(({tileProviderId}) => isEnabled(tileProviderId))

    const getPendingRequestCount = ({tileProviderId, enabled} = {}) =>
        pendingRequests
            .filter(request => tileProviderId === undefined || tileProviderId === request.tileProviderId)
            .filter(request => enabled === undefined || enabled === isEnabled(request.tileProviderId))
            .length

    const isEnabled = tileProviderId =>
        tileProviderId && tileProvidersStatus[tileProviderId]

    const enqueue = ({tileProviderId, requestId, request, response$, cancel$}) => {
        assertValue(tileProviderId, _.isString, 'tileProviderId must be provided', true)
        assertValue(requestId, _.isString, 'requestId must be provided', true)
        assertValue(request, _.isObject, 'request must be provided', true)
        pendingRequests.push({tileProviderId, requestId, request, response$, cancel$})
        log.debug(() => `Enqueued ${requestTag({tileProviderId, requestId})}, enqueued: ${getPendingRequestCount()}`)
    }

    const dequeueByIndex = (index, dequeueMode = '') => {
        if (index !== -1 && index < pendingRequests.length) {
            const [pendingRequest] = pendingRequests.splice(index, 1)
            const tileProviderId = pendingRequest.tileProviderId
            if (isEnabled(tileProviderId)) {
                log.debug(() => `Dequeued by ${dequeueMode} ${requestTag(pendingRequest)}, enqueued: ${getPendingRequestCount()}`)
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
            log.debug(() => `Removed ${removed} for ${tileProviderTag(tileProviderId)}, enqueued: ${getPendingRequestCount()}`)
        } else {
            log.warn('Cannot remove as no tileProvider id was provided')
        }
    }

    const removeTileProvider = tileProviderId => {
        discardByTileProviderId(tileProviderId)
        delete tileProvidersStatus[tileProviderId]
    }

    const setEnabled = (tileProviderId, enabled) => {
        tileProvidersStatus[tileProviderId] = enabled
    }

    return {enqueue, dequeueByTileProviderIds, discardByRequestId, removeTileProvider, getEnabledRequests, getPendingRequestCount, setEnabled}
}
