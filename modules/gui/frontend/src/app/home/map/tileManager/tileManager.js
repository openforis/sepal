import {ReplaySubject, Subject, of} from 'rxjs'
import {available, execute} from './activeRequest'
import {dequeue, enqueue, pending, prioritize} from './pendingRequest'
import {finalize, first, map, mergeMap, takeUntil, tap} from 'rxjs/operators'
import {requestTag, tileProviderTag} from './tag'
import {v4 as uuid} from 'uuid'

const tileProvidersInfo = {}
const request$ = new Subject()
const hidden$ = new Subject()
const enqueued$ = new Subject()
const executed$ = new Subject()

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
        if (available()) {
            const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
            execute({tileProvider, tileProviderId, requestId, request, response$, cancel$, executed$})
        } else {
            enqueue({tileProviderId, requestId, request, response$, cancel$, enqueued$})
        }
    }
)

enqueued$.subscribe(
    requestId => {
        console.log(`Request enqueued: ${requestId}`)
        prioritize()
    }
)

executed$.subscribe(
    ({tileProviderId, requestId}) => {
        console.log(`Executed: ${requestTag({tileProviderId, requestId})}`)
        if (pending()) {
            const {tileProviderId, requestId, request, response$, cancel$} = dequeue()
            console.log(`NEXT ${requestTag({tileProviderId, requestId})}`)
            const tileProvider = getTileProviderInfo(tileProviderId).tileProvider
            execute({tileProvider, tileProviderId, requestId, request, response$, cancel$, executed$})
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

// export class TileManager {
//     constructor(tileProvider) {
//         this.tileProviderId = uuid()
//         this.typeProviderType = tileProvider.getType()
//         // TODO: handle type, maybe providing a completely independent instance of tileManager
//         addTileProvider(this.tileProviderId, tileProvider)
//         this.hidden = false
//     }

//     loadTile$(request) {
//         const response$ = new ReplaySubject()
//         const cancel$ = new ReplaySubject()
//         request$.next({tileProviderId: this.tileProviderId, request, response$, cancel$})
//         return response$.pipe(
//             first(),
//             finalize(() => cancel$.next())
//         )
//     }

//     releaseTile(requestId) {
//         console.log('release tile:', requestId)
//     }

//     hide(hidden) {
//         hidden$.next({tileProviderId: this.tileProviderId, hidden})
//     }

//     close() {
//         removeTileProvider(this.tileProviderId)
//     }
// }
