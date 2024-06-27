import _ from 'lodash'

import {assertValue} from '~/assertValue'
import {getLogger} from '~/log'
import {tileProviderTag, tileTag} from '~/tag'

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

    const enqueue = ({tileProviderId, tileId, request, response$, cancel$}) => {
        assertValue(tileProviderId, _.isString, 'tileProviderId must be provided', true)
        assertValue(tileId, _.isString, 'tileId must be provided', true)
        assertValue(request, _.isObject, 'request must be provided', true)
        pendingRequests.push({tileProviderId, tileId, request, response$, cancel$})
        log.debug(() => `Enqueued ${tileTag({tileProviderId, tileId})}, enqueued: ${getPendingRequestCount()}`)
    }

    const dequeueByIndex = (index, dequeueMode = '') => {
        if (index !== -1 && index < pendingRequests.length) {
            const [pendingRequest] = pendingRequests.splice(index, 1)
            const tileProviderId = pendingRequest.tileProviderId
            if (isEnabled(tileProviderId)) {
                log.debug(() => `Dequeued by ${dequeueMode} ${tileTag(pendingRequest)}, enqueued: ${getPendingRequestCount()}`)
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

    const discardByTileId = tileId => {
        if (tileId) {
            const index = pendingRequests.findIndex(pendingRequest => pendingRequest.tileId === tileId)
            if (index !== -1) {
                return !!dequeueByIndex(index, 'tileId (discarded)')
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
                .reduce((count, request) => count + (discardByTileId(request.tileId) ? 1 : 0), 0)
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

    return {enqueue, dequeueByTileProviderIds, discardByTileId, removeTileProvider, getEnabledRequests, getPendingRequestCount, setEnabled}
}
