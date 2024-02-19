import {BehaviorSubject, Subject, filter, finalize, first} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {tileProviderTag, tileTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

const tileManagers = {}

const createTileManager = ({type, concurrency}) => {
    const tileProviders = {}
    const tileRequest$ = new Subject()
    const tileResult$ = new Subject()
    const status$ = new Subject()

    const requestQueue = getRequestQueue()
    const requestExecutor = getRequestExecutor({tileResult$, concurrency})

    const getTileProvider = id => tileProviders[id]

    const addTileProvider = (tileProviderId, tileProvider) => {
        if (!tileProviders[tileProviderId]) {
            tileProviders[tileProviderId] = tileProvider
            log.debug(() => `Added ${tileProviderTag(tileProviderId)}: ${type}`)
        } else {
            log.warn(() => `Cannot add existing ${tileProviderTag(tileProviderId)}`)
        }
    }

    const removeTileProvider = tileProviderId => {
        if (tileProviders[tileProviderId]) {
            requestQueue.removeTileProvider(tileProviderId)
            requestExecutor.removeTileProvider(tileProviderId)
            delete tileProviders[tileProviderId]
            log.debug(() => `Removed ${tileProviderTag(tileProviderId)}: ${type}`)
        } else {
            log.debug(() => `Skipped removing non-existing ${tileProviderTag(tileProviderId)}`)
        }
    }

    const loadTile = ({tileProviderId, tileId, request, response$, cancel$}) => {
        log.debug(() => `Load ${tileTag({tileProviderId, tileId})}`)
        tileRequest$.next({tileProviderId, tileId, request, response$, cancel$})
        updateStatus(tileProviderId)
    }

    const releaseTile = (tileProviderId, tileId) => {
        log.debug(() => `Release ${tileTag({tileProviderId, tileId})}`)
        requestQueue.discardByTileId(tileId)
        requestExecutor.cancelByTileId(tileId)
        updateStatus(tileProviderId)
    }

    const notifyEnabled = () =>
        requestQueue.getEnabledRequests().forEach(
            ({tileProviderId, tileId}) => requestExecutor.notify({tileProviderId, tileId})
        )

    const reenqueueDisabled = tileProviderId =>
        requestExecutor
            .cancelByTileProviderId(tileProviderId)
            .forEach(cancelledRequest => loadTile(cancelledRequest))

    const setVisibility = (tileProviderId, visible) => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${visible ? 'visible' : 'hidden'}`)
        requestExecutor.setHidden(tileProviderId, !visible)
        notifyEnabled()
        updateStatus(tileProviderId)
    }

    const setEnabled = (tileProviderId, enabled) => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${enabled ? 'enabled' : 'disabled'}`)
        requestExecutor.setEnabled(tileProviderId, enabled)
        requestQueue.setEnabled(tileProviderId, enabled)
        if (enabled) {
            notifyEnabled()
        } else {
            reenqueueDisabled(tileProviderId)
        }
        updateStatus(tileProviderId)
    }

    const getStats = tileProviderId => {
        const enqueued = requestQueue.getPendingRequestCount({tileProviderId})
        const enqueuedEnabled = requestQueue.getPendingRequestCount({tileProviderId, enabled: true})
        const totalEnqueued = requestQueue.getPendingRequestCount()
        const active = requestExecutor.getActiveRequestCount(tileProviderId)
        const totalActive = requestExecutor.getActiveRequestCount()
        const maxActive = getTileProvider(tileProviderId)?.getConcurrency() || 0
        const pending = enqueued + active
        const pendingEnabled = enqueuedEnabled + active
        const pendingDisabled = enqueued - enqueuedEnabled
        const totalPending = totalEnqueued + totalActive
        const msg = [
            `type: ${type}`,
            `enqueued: ${enqueued}/${totalEnqueued}`,
            `active: ${active}/${totalActive}/${maxActive}`,
            `pending: ${pending}/${totalPending}`,
        ].join(', ')
        log.debug(() => `${tileProviderTag(tileProviderId)}: ${msg}`)
        return {tileProviderId, type, enqueued, totalEnqueued, active, totalActive, maxActive, pending, pendingEnabled, pendingDisabled, totalPending, msg}
    }

    const updateStatus = tileProviderId =>
        status$.next(getStats(tileProviderId))

    const getStatus$ = tileProviderId =>
        status$.pipe(
            filter(status => status.tileProviderId === tileProviderId)
        )

    tileRequest$.subscribe(
        ({tileProviderId, tileId = uuid(), request, response$, cancel$, retries}) => {
            requestQueue.enqueue({tileProviderId, tileId, request, response$, cancel$, retries})
            requestExecutor.notify({tileProviderId, tileId})
        }
    )

    tileResult$.subscribe(
        ({tileProviderId, nextTileProviderIds, cancelledRequest}) => {
            const request = requestQueue.dequeueByTileProviderIds(nextTileProviderIds)
            if (request) {
                const tileProvider = getTileProvider(request.tileProviderId)
                if (tileProvider) {
                    requestExecutor.execute(tileProvider, request)
                } else {
                    throw new Error(`Unknown ${tileProviderTag(request.tileProviderId)}`)
                }
            } else {
                log.trace(() => 'No request pending for any enabled tileProviders')
            }
            if (cancelledRequest) {
                log.debug(`Re-enqueue ${tileTag(cancelledRequest)}`)
                loadTile(cancelledRequest)
            }
            updateStatus(tileProviderId)
        }
    )

    return {addTileProvider, removeTileProvider, loadTile, releaseTile, setVisibility, setEnabled, getStatus$}
}

export const getTileManager = ({tileProviderId = uuid(), tileProvider}) => {
    const type = tileProvider.getType()
    const concurrency = tileProvider.getConcurrency()

    if (!tileManagers[type]) {
        tileManagers[type] = createTileManager({type, concurrency})
    }

    const tileManager = tileManagers[type]

    const getStatus$ = () =>
        tileManager.getStatus$(tileProviderId)

    const loadTile$ = request => {
        const response$ = new BehaviorSubject()
        const cancel$ = new Subject()
        const tileId = request.id
        tileManager.loadTile({tileProviderId, tileId, request, response$, cancel$})
        return response$.pipe(
            filter(response => response),
            first(),
            finalize(() => cancel$.next())
        )
    }

    const releaseTile = tileId => {
        tileManager.releaseTile(tileProviderId, tileId)
    }

    const setVisibility = visible => {
        tileManager.setVisibility(tileProviderId, visible)
    }

    const setEnabled = enabled => {
        tileManager.setEnabled(tileProviderId, enabled)
    }

    const close = () => {
        tileManager.removeTileProvider(tileProviderId)
    }

    tileManager.addTileProvider(tileProviderId, tileProvider)
    
    return {
        loadTile$,
        releaseTile,
        setVisibility,
        setEnabled,
        getStatus$,
        close
    }
}
