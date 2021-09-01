import {Subject} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const log = getLogger('tileManager/group')

const tileProviderGroups = {}

const createTileManagerGroup = (type, concurrency) => {
    const tileProviders = {}
    const request$ = new Subject()
    
    const requestQueue = getRequestQueue()
    const requestExecutor = getRequestExecutor(concurrency)
    
    const getTileProvider = id => {
        const tileProvider = tileProviders[id]
        if (tileProvider) {
            return tileProvider
        }
        throw new Error(`Unknown ${tileProviderTag(id)}`)
    }
    
    const addTileProvider = (tileProviderId, tileProvider) => {
        if (!tileProviders[tileProviderId]) {
            tileProviders[tileProviderId] = tileProvider
            log.debug(() => `Added ${tileProviderTag(tileProviderId)}`)
        } else {
            log.warn(`Cannot add existing ${tileProviderTag(tileProviderId)}`)
        }
    }
    
    const removeTileProvider = tileProviderId => {
        if (tileProviders[tileProviderId]) {
            requestQueue.removeTileProvider(tileProviderId)
            requestExecutor.removeTileProvider(tileProviderId)
            delete tileProviders[tileProviderId]
            log.debug(() => `Removed ${tileProviderTag(tileProviderId)}`)
        } else {
            log.warn(`Cannot remove non-existing ${tileProviderTag(tileProviderId)}`)
        }
    }

    const submit = currentRequest =>
        request$.next(currentRequest)

    const setHidden = (tileProviderId, hidden) => {
        requestExecutor.setHidden(tileProviderId, hidden)
        requestQueue.scan(
            ({tileProviderId, requestId}) => requestExecutor.notify({tileProviderId, requestId})
        )
    }
    
    const cancelByRequestId = requestId => {
        requestQueue.discardByRequestId(requestId)
        requestExecutor.cancelByRequestId(requestId)
    }

    const getStats = tileProviderId => {
        const enqueued = requestQueue.getCount(tileProviderId)
        const totalEnqueued = requestQueue.getCount()
        const active = requestExecutor.getCount(tileProviderId)
        const totalActive = requestExecutor.getCount()
        const maxActive = getTileProvider(tileProviderId).getConcurrency()
        const pending = enqueued + active
        const totalPending = totalEnqueued + totalActive
        const msg = [
            `type: ${type}`,
            `enqueued: ${enqueued}/${totalEnqueued}`,
            `active: ${active}/${totalActive}/${maxActive}`,
            `pending: ${pending}/${totalPending}`,
        ].join(', ')
        return {type, enqueued, totalEnqueued, active, totalActive, maxActive, pending, totalPending, msg}
    }
    
    request$.subscribe(
        ({tileProviderId, requestId = uuid(), request, response$, cancel$}) => {
            if (requestExecutor.isAvailable()) {
                const tileProvider = getTileProvider(tileProviderId)
                requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
            } else {
                requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$})
                requestExecutor.notify({tileProviderId, requestId})
            }
        }
    )
    
    requestExecutor.finished$.subscribe(
        ({currentRequest, replacementTileProviderId, priorityTileProviderIds}) => {
            if (requestQueue.isEmpty()) {
                log.debug(() => 'Pending request queue empty')
            } else {
                if (replacementTileProviderId) {
                    const request = requestQueue.dequeueByTileProviderIds([replacementTileProviderId])
                    const tileProvider = getTileProvider(request.tileProviderId)
                    requestExecutor.execute(tileProvider, request)
                    submit(currentRequest)
                } else {
                    const request = requestQueue.dequeueByTileProviderIds(priorityTileProviderIds)
                    const tileProvider = getTileProvider(request.tileProviderId)
                    requestExecutor.execute(tileProvider, request)
                }
            }
        }
    )

    return {getTileProvider, addTileProvider, removeTileProvider, submit, cancelByRequestId, setHidden, getStats}
}

export const getTileManagerGroup = tileProvider => {
    const type = tileProvider.getType()
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(type, tileProvider.getConcurrency())
    }
    return tileProviderGroups[type]
}
