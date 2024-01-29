import {ReplaySubject, Subject, filter, finalize, first, map, mergeMap, timer} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {requestTag, tileProviderTag} from 'tag'
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
        tileRequest$.next({tileProviderId, requestId, request, response$, cancel$})
        updateStatus(tileProviderId)
    }

    const releaseTile = (tileProviderId, requestId) => {
        log.debug(() => `Release tile ${requestTag({tileProviderId, requestId})}`)
        requestQueue.discardByRequestId(requestId)
        requestExecutor.cancelByRequestId(requestId)
        updateStatus(tileProviderId)
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

    const updateStatus = tileProviderId =>
        status$.next(getStats(tileProviderId))

    const getStatus$ = tileProviderId =>
        status$.pipe(
            filter(status => status.tileProviderId === tileProviderId)
        )

    tileRequest$.subscribe(
        ({tileProviderId, requestId = uuid(), request, response$, cancel$, retries}) => {
            requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$, retries})
            requestExecutor.notify({tileProviderId, requestId})
        }
    )

    tileResult$.subscribe(
        ({tileProviderId, nextTileProviderIds, cancelledRequest}) => {
            const request = requestQueue.dequeueByTileProviderIds(nextTileProviderIds)
            if (request) {
                const tileProvider = getTileProvider(request.tileProviderId)
                requestExecutor.execute(tileProvider, request)
            } else {
                log.trace(() => 'No request pending for any enabled tileProviders')
            }
            if (cancelledRequest) {
                log.debug(`Re-enqueuing ${requestTag(cancelledRequest)}`)
                loadTile(cancelledRequest)
            }
            updateStatus(tileProviderId)
        }
    )

    return {addTileProvider, removeTileProvider, loadTile, releaseTile, setVisibility, setEnabled, getStatus$}
}

export const getTileManager = ({tileProviderId = uuid(), tileProvider, renderingEnabled$}) => {
    const type = tileProvider.getType()
    const concurrency = tileProvider.getConcurrency()

    if (!tileManagers[type]) {
        tileManagers[type] = createTileManager({type, concurrency})
    }

    const tileManager = tileManagers[type]
    const subscriptions = []

    const getStatus$ = () =>
        tileManager.getStatus$(tileProviderId)

    const loadTile$ = request => {
        const response$ = new ReplaySubject(1)
        const cancel$ = new Subject()
        const requestId = request.id
        tileManager.loadTile({tileProviderId, requestId, request, response$, cancel$})
        return response$.pipe(
            first(),
            finalize(() => cancel$.next())
        )
    }

    const releaseTile = requestId => {
        tileManager.releaseTile(tileProviderId, requestId)
    }

    const setVisibility = visible => {
        tileManager.setVisibility(tileProviderId, visible)
    }

    const setEnabled = enabled => {
        tileManager.setEnabled(tileProviderId, enabled)
    }

    const close = () => {
        tileManager.removeTileProvider(tileProviderId)
        subscriptions.forEach(
            subscription => subscription.unsubscribe()
        )
    }

    tileManager.addTileProvider(tileProviderId, tileProvider)

    if (renderingEnabled$) {
        setEnabled(renderingEnabled$.getValue())

        subscriptions.push(
            renderingEnabled$.subscribe(
                enabled => setEnabled(enabled)
            )
        )
    } else {
        setEnabled(true)
    }
    
    return {
        loadTile$,
        releaseTile,
        setVisibility,
        setEnabled,
        getStatus$,
        close
    }
}
