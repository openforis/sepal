import {ReplaySubject, Subject} from 'rxjs'
import {finalize, first} from 'rxjs/operators'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag} from './tag'
import {v4 as uuid} from 'uuid'

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
            hidden: false,
            activeRequests: 0,
        }
        console.log(`Added ${tileProviderTag(tileProviderId)}`)
    }
    
    const removeTileProvider = tileProviderId => {
        delete tileProvidersInfo[tileProviderId]
        console.log(`Removed ${tileProviderTag(tileProviderId)}`)
    }
    
    request$.subscribe(
        ({tileProviderId, request, response$, cancel$}) => {
            const requestId = uuid()
            if (requestExecutor.available()) {
                const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                requestExecutor.execute({tileProvider, tileProviderId, requestId, request, response$, cancel$})
            } else {
                requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$})
            }
        }
    )
    
    requestQueue.enqueued$.subscribe(
        requestId => {
            console.log(`Request enqueued: ${requestId}`)
            requestQueue.prioritize()
        }
    )
    
    requestExecutor.started$.subscribe(
        tileProviderId => {
            const tileProvider = getTileProviderInfo(tileProviderId)
            tileProvider.activeRequests += 1
            console.log(`** Started: ${tileProviderTag(tileProviderId)}, active ${tileProvider.activeRequests}`)
        }
    )
    
    requestExecutor.finished$.subscribe(
        tileProviderId => {
            const tileProvider = getTileProviderInfo(tileProviderId)
            tileProvider.activeRequests -= 1
            console.log(`** Finished: ${tileProviderTag(tileProviderId)}, active ${tileProvider.activeRequests}`)
            if (requestQueue.pending()) {
                const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeue()
                const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                requestExecutor.execute({tileProvider, tileProviderId, requestId, request, response$, cancel$})
            }
        }
    )
    
    // hidden$.subscribe(
    //     ({tileProviderId, hidden}) => {
    //         console.log(`Changing visibility of ${tileProviderId} to ${hidden ? 'hidden' : 'visible'}`)
    //         getTileProviderInfo(tileProviderId).hidden = hidden
    //     }
    // )

    return {getTileProviderInfo, addTileProvider, removeTileProvider, request$, hidden$}
}

const getTileManagerGroup = tileProvider => {
    const type = tileProvider.getType()
    const concurrency = tileProvider.getConcurrency()
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(concurrency)
    }
    return tileProviderGroups[type]
}

export const getTileManager = tileProvider => {
    const tileProviderId = uuid()
    const {getTileProviderInfo, addTileProvider, removeTileProvider, request$, hidden$} = getTileManagerGroup(tileProvider)

    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getType()
    }

    const getConcurrency = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getConcurrency()
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject()
        const cancel$ = new ReplaySubject()
        request$.next({tileProviderId, request, response$, cancel$})
        return response$.pipe(
            first(),
            finalize(() => cancel$.next())
        )
    }

    const releaseTile = requestId => {
        console.log(`Release tile id: ${requestId}`)
    }

    const hide = hidden => {
        hidden$.next({tileProviderId, hidden})
    }

    const close = () => {
        console.log('*** CLOSE ***')
        removeTileProvider(tileProviderId)
    }
    
    return {
        getType,
        getConcurrency,
        loadTile$,
        releaseTile,
        hide,
        close
    }
}
