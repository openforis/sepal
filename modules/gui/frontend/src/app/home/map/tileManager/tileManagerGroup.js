import {Subject} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const log = getLogger('tileManager/group')

const tileProviderGroups = {}

const createTileManagerGroup = concurrency => {
    const tileProvidersInfo = {}
    const request$ = new Subject()
    
    const requestQueue = getRequestQueue()
    const requestExecutor = getRequestExecutor(concurrency)
    
    const getTileProviderInfo = id => {
        const tileProviderInfo = tileProvidersInfo[id]
        if (tileProviderInfo) {
            return tileProviderInfo
        }
        throw new Error(`Unknown ${tileProviderTag(id)}`)
    }
    
    const addTileProvider = (tileProviderId, tileProvider) => {
        tileProvidersInfo[tileProviderId] = {
            tileProvider,
            hidden: false
        }
        log.debug(() => `Added ${tileProviderTag(tileProviderId)}`)
    }
    
    const removeTileProvider = tileProviderId => {
        requestQueue.removeTileProvider(tileProviderId)
        requestExecutor.removeTileProvider(tileProviderId)
        delete tileProvidersInfo[tileProviderId]
        log.debug(() => `Removed ${tileProviderTag(tileProviderId)}`)
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

    const getCount = tileProviderId => ({
        enqueued: requestQueue.getCount(tileProviderId),
        executing: requestExecutor.getCount(tileProviderId)
    })
    
    request$.subscribe(
        ({tileProviderId, requestId = uuid(), request, response$, cancel$}) => {
            if (requestExecutor.isAvailable()) {
                const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
            } else {
                requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$})
                requestExecutor.notify({tileProviderId, requestId})
            }
        }
    )
    
    requestExecutor.finished$.subscribe(
        ({currentRequest, replacementTileProviderId}) => {
            if (requestQueue.isEmpty()) {
                log.debug(() => 'Pending request queue empty')
            } else {
                if (replacementTileProviderId) {
                    const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeueByTileProviderId(replacementTileProviderId)
                    const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                    requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
                    submit(currentRequest)
                } else {
                    const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeueByTileProviderId(currentRequest.tileProviderId)
                    const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                    requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
                }
            }
        }
    )

    return {getTileProviderInfo, addTileProvider, removeTileProvider, submit, cancelByRequestId, setHidden, getCount}
}

export const getTileManagerGroup = tileProvider => {
    const type = tileProvider.getType()
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(tileProvider.getConcurrency())
    }
    return tileProviderGroups[type]
}
