import {ReplaySubject, Subject} from 'rxjs'
import {finalize, first} from 'rxjs/operators'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag} from './tag'
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
    
    request$.subscribe(
        ({tileProviderId, request, response$, cancel$}) => {
            const requestId = uuid()
            if (requestExecutor.isAvailable()) {
                const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
                requestExecutor.execute({tileProvider, tileProviderId, requestId, request, response$, cancel$})
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
        ({tileProviderId, requestId, replacementRequest = {}}) => {
            // console.log(`** Finished: ${requestTag({tileProviderId, requestId})}`)
            if (requestQueue.isEmpty()) {
                console.log('Pending request queue empty')
            } else {
                const {tileProviderId, requestId, request, response$, cancel$} = requestQueue.dequeue(replacementRequest.requestId)
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
    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(tileProvider.getConcurrency())
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
