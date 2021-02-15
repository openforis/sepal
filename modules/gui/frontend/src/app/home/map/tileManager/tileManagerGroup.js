import {Subject} from 'rxjs'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {requestTag, tileProviderTag} from './tag'
import {v4 as uuid} from 'uuid'
import _ from 'lodash'

const tileProviderGroups = {}

const createTileManagerGroup = concurrency => {
    const tileProvidersInfo = {}
    const request$ = new Subject()
    const hidden$ = new Subject()
    
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
        console.log(`Added ${tileProviderTag(tileProviderId)}`)
    }
    
    const removeTileProvider = tileProviderId => {
        delete tileProvidersInfo[tileProviderId]
        console.log(`Removed ${tileProviderTag(tileProviderId)}`)
    }

    const submit = currentRequest =>
        request$.next(currentRequest)
    
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
    
    requestExecutor.started$.subscribe(
        ({tileProviderId, requestId}) => {
            // console.log(`** Started: ${requestTag({tileProviderId, requestId})}`)
        }
    )
    
    requestExecutor.finished$.subscribe(
        ({tileProviderId, requestId, currentRequest, replacementRequest}) => {
            // console.log(`** Finished: ${requestTag({tileProviderId, requestId})}`)
            if (requestQueue.isEmpty()) {
                console.log('Pending request queue empty')
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
    
    // hidden$.subscribe(
    //     ({tileProviderId, hidden}) => {
    //         console.log(`Changing visibility of ${tileProviderId} to ${hidden ? 'hidden' : 'visible'}`)
    //         getTileProviderInfo(tileProviderId).hidden = hidden
    //     }
    // )

    return {getTileProviderInfo, addTileProvider, removeTileProvider, submit, hidden$}
}

export const getTileManagerGroup = tileProvider => {
    const type = tileProvider.getType()
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(tileProvider.getConcurrency())
    }
    return tileProviderGroups[type]
}
