import {BehaviorSubject, ReplaySubject, Subject, finalize, first} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

const tileManagers = {}

const createTileManager = (type, concurrency) => {
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

    const loadTile = ({tileProviderId, requestId, request, response$, cancel$}) => {
        log.debug(() => `Load tile ${requestTag({tileProviderId, requestId})}`)
        request$.next({tileProviderId, requestId, request, response$, cancel$})
    }

    const releaseTile = (tileProviderId, requestId) => {
        log.debug(() => `Release tile ${requestTag({tileProviderId, requestId})}`)
        requestQueue.discardByRequestId(requestId)
        requestExecutor.cancelByRequestId(requestId)
    }

    const notifyEnabled = () =>
        requestQueue.getEnabledRequests().forEach(
            ({tileProviderId, requestId}) => requestExecutor.notify({tileProviderId, requestId})
        )

    const reenqueueDisabled = tileProviderId =>
        requestExecutor
            .cancelByTileProviderId(tileProviderId)
            .forEach(cancelledRequest => loadTile(cancelledRequest))

    const setVisibility = (tileProviderId, visible) => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${visible ? 'visible' : 'hidden'}`)
        requestExecutor.setHidden(tileProviderId, !visible)
        notifyEnabled()
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
    }

    const getStats = tileProviderId => {
        const enqueued = requestQueue.getPendingRequestCount({tileProviderId})
        const enqueuedEnabled = requestQueue.getPendingRequestCount({tileProviderId, enabled: true})
        const totalEnqueued = requestQueue.getPendingRequestCount()
        const active = requestExecutor.getActiveRequestCount(tileProviderId)
        const totalActive = requestExecutor.getActiveRequestCount()
        const maxActive = getTileProvider(tileProviderId).getConcurrency()
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

    request$.subscribe(
        ({tileProviderId, requestId = uuid(), request, response$, cancel$}) => {
            requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$})
            requestExecutor.notify({tileProviderId, requestId})
        }
    )

    requestExecutor.ready$.subscribe(
        ({cancelledRequest, tileProviderIds}) => {
            const request = requestQueue.dequeueByTileProviderIds(tileProviderIds)
            if (request) {
                const tileProvider = getTileProvider(request.tileProviderId)
                requestExecutor.execute(tileProvider, request)
                if (cancelledRequest) {
                    loadTile(cancelledRequest)
                }
            } else {
                log.trace(() => 'No request pending for the enabled tileProviders')
            }
        }
    )

    return {addTileProvider, removeTileProvider, loadTile, releaseTile, setVisibility, setEnabled, getStats}
}

export const getTileManager = ({tileProviderId = uuid(), tileProvider, renderingEnabled$}) => {
    const status$ = new BehaviorSubject(0)
    const type = tileProvider.getType()
    const concurrency = tileProvider.getConcurrency()

    if (!tileManagers[type]) {
        tileManagers[type] = createTileManager(type, concurrency)
    }

    const tileManager = tileManagers[type]

    tileManager.addTileProvider(tileProviderId, tileProvider)

    const updateStatus = () => {
        status$.next(tileManager.getStats(tileProviderId))
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject(1)
        const cancel$ = new Subject()
        const requestId = request.id
        tileManager.loadTile({tileProviderId, requestId, request, response$, cancel$})
        updateStatus()
        return response$.pipe(
            first(),
            finalize(() => {
                cancel$.next()
                updateStatus()
            })
        )
    }

    const releaseTile = requestId => {
        tileManager.releaseTile(tileProviderId, requestId)
        updateStatus()
    }

    const setVisibility = visible => {
        tileManager.setVisibility(tileProviderId, visible)
        updateStatus()
    }

    const setEnabled = enabled => {
        tileManager.setEnabled(tileProviderId, enabled)
        updateStatus()
    }

    const close = () => {
        tileManager.removeTileProvider(tileProviderId)
    }

    setEnabled(renderingEnabled$.getValue())
    // setEnabled(false)

    renderingEnabled$.subscribe(
        enabled => setEnabled(enabled)
    )

    return {
        loadTile$,
        releaseTile,
        setVisibility,
        setEnabled,
        status$,
        close
    }
}
