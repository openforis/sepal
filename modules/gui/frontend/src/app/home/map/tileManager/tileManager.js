import {ReplaySubject, Subject, of} from 'rxjs'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
// import {available, execute} from './activeRequest'
// import {dequeue, enqueue, pending, prioritize} from './pendingRequest'

import {finalize, first, map, mergeMap, takeUntil, tap} from 'rxjs/operators'
import {requestTag, tileProviderTag} from './tag'
import {v4 as uuid} from 'uuid'

const CONCURRENCY = 4

const tileProvidersInfo = {}
const request$ = new Subject()
const hidden$ = new Subject()
const enqueued$ = new Subject()
const executed$ = new Subject()

const requestQueue = getRequestQueue({enqueued$})
const requestExecutor = getRequestExecutor({concurrency: CONCURRENCY, executed$})

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
        pendingRequestCount: 0,
    }
    console.log(`Added ${tileProviderTag(tileProviderId)}`)
}

const removeTileProvider = tileProviderId => {
    // delete tileProvidersInfo[tileProviderId]
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

// enqueued$.subscribe(
//     requestId => {
//         console.log(`Request enqueued: ${requestId}`)
//         requestQueue.prioritize()
//     }
// )

executed$.subscribe(
    ({tileProviderId, requestId}) => {
        console.log(`Executed: ${requestTag({tileProviderId, requestId})}`)
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

export const getTileManager = tileProvider => {
    const tileProviderId = uuid()
    // TODO: handle type, maybe providing a completely independent instance of tileManager
    // const typeProviderType = tileProvider.getType()
    addTileProvider(tileProviderId, tileProvider)

    const getType = () => {
        return getTileProviderInfo(tileProviderId).tileProvider.getType()
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
        removeTileProvider(tileProviderId)
    }
    
    return {
        getType,
        loadTile$,
        releaseTile,
        hide,
        close
    }
}
