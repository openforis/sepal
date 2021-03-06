import {Subject} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const log = getLogger('tileManager')

const tileProviderGroups = {}

const createTileManagerGroup = concurrency => {
    const tileProvidersInfo = {}
    const request$ = new Subject()
    const cancel$ = new Subject()
    
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
        log.debug(`Added ${tileProviderTag(tileProviderId)}`)
    }
    
    const removeTileProvider = tileProviderId => {
        delete tileProvidersInfo[tileProviderId]
        log.debug(`Removed ${tileProviderTag(tileProviderId)}`)
    }

    const submit = currentRequest =>
        request$.next(currentRequest)

    const cancel = requestId =>
        cancel$.next(requestId)

    const hidden = (tileProviderId, hidden) => {
        requestExecutor.hidden(tileProviderId, hidden)
        requestQueue.scan(({tileProviderId, requestId}) => requestExecutor.notify({tileProviderId, requestId}))
    }
    
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
        ({currentRequest, replacementRequest}) => {
            // log.debug(`** Finished: ${requestTag({tileProviderId, requestId})}`)
            if (requestQueue.isEmpty()) {
                log.debug('Pending request queue empty')
            } else {
                if (replacementRequest) {
                    const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeuePriority(replacementRequest.requestId)
                    const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                    requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
                    submit(currentRequest)
                } else {
                    const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeueNormal()
                    const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                    requestExecutor.execute(tileProvider, {tileProviderId, requestId, request, response$, cancel$})
                }
            }
        }
    )

    cancel$.subscribe(
        requestId => {
            requestQueue.remove(requestId)
            requestExecutor.cancel(requestId)
        }
    )
    
    return {getTileProviderInfo, addTileProvider, removeTileProvider, submit, cancel, hidden}
}

export const getTileManagerGroup = tileProvider => {
    const type = tileProvider.getType()
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(tileProvider.getConcurrency())
    }
    return tileProviderGroups[type]
}
