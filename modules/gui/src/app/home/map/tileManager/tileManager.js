import {BehaviorSubject, ReplaySubject, Subject, finalize, first} from 'rxjs'
import {getLogger} from 'log'
import {getRequestExecutor} from './requestExecutor'
import {getRequestQueue} from './requestQueue'
import {requestTag, tileProviderTag} from 'tag'
import {v4 as uuid} from 'uuid'

const log = getLogger('tileManager')

const tileProviderGroups = {}

const createTileManagerGroup = (type, concurrency) => {
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

    const setHidden = (tileProviderId, hidden) => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${hidden ? 'hidden' : 'visible'}`)
        requestExecutor.setHidden(tileProviderId, hidden)
        requestQueue.scan(
            ({tileProviderId, requestId}) => requestExecutor.notify({tileProviderId, requestId})
        )
    }

    const setEnabled = (tileProviderId, enabled) => {
        log.debug(() => `Set ${tileProviderTag(tileProviderId)} ${enabled ? 'enabled' : 'disabled'}`)
        requestExecutor.setEnabled(tileProviderId, enabled)
        requestQueue.setEnabled(tileProviderId, enabled)
        if (!enabled) {
            const cancelledRequests = requestExecutor.cancelByTileProviderId(tileProviderId)
            cancelledRequests.forEach(cancelledRequest => loadTile(cancelledRequest))
        }
    }

    const getStats = tileProviderId => {
        const enqueued = requestQueue.getCount(tileProviderId)
        const totalEnqueued = requestQueue.getCount()
        const active = requestExecutor.getCount(tileProviderId)
        const totalActive = requestExecutor.getCount()
        const maxActive = getTileProvider(tileProviderId).getConcurrency()
        const pending = enqueued + active
        const totalPending = totalEnqueued + totalActive
        const msg = [
            `type: ${type}`,
            `enqueued: ${enqueued}/${totalEnqueued}`,
            `active: ${active}/${totalActive}/${maxActive}`,
            `pending: ${pending}/${totalPending}`,
        ].join(', ')
        log.debug(() => `${tileProviderTag(tileProviderId)}: ${msg}`)
        return {type, enqueued, totalEnqueued, active, totalActive, maxActive, pending, totalPending, msg}
    }

    request$.subscribe(
        ({tileProviderId, requestId = uuid(), request, response$, cancel$}) => {
            requestQueue.enqueue({tileProviderId, requestId, request, response$, cancel$})
            requestExecutor.notify({tileProviderId, requestId})
        }
    )

    requestExecutor.ready$.subscribe(
        ({cancelledRequest, tileProviderIds}) => {
            if (requestQueue.isEmpty()) {
                log.trace(() => 'Pending request queue empty')
            } else {
                const request = requestQueue.dequeueByTileProviderIds(tileProviderIds)
                const tileProvider = getTileProvider(request.tileProviderId)
                requestExecutor.execute(tileProvider, request)
                if (cancelledRequest) {
                    loadTile(cancelledRequest)
                }
            }
        }
    )

    return {addTileProvider, removeTileProvider, loadTile, releaseTile, setHidden, setEnabled, getStats}
}

export const getTileManagerGroup = (tileProviderId, tileProvider) => {
    const type = tileProvider.getType()
    const concurrency = tileProvider.getConcurrency()

    if (!tileProviderGroups[type]) {
        tileProviderGroups[type] = createTileManagerGroup(type, concurrency)
    }
    const tileManagerGroup = tileProviderGroups[type]

    tileManagerGroup.addTileProvider(tileProviderId, tileProvider)

    const loadTile = request => tileManagerGroup.loadTile(request)
    const releaseTile = requestId => tileManagerGroup.releaseTile(tileProviderId, requestId)
    const setHidden = hidden => tileManagerGroup.setHidden(tileProviderId, hidden)
    const setEnabled = enabled => tileManagerGroup.setEnabled(tileProviderId, enabled)
    const getStats = () => tileManagerGroup.getStats(tileProviderId)
    const close = () => tileManagerGroup.removeTileProvider(tileProviderId)

    setEnabled(true)

    return {loadTile, releaseTile, setHidden, setEnabled, getStats, close}
}

export const getTileManager = ({tileProviderId = uuid(), tileProvider}) => {
    const pending$ = new BehaviorSubject(0)
    const tileManagerGroup = getTileManagerGroup(tileProviderId, tileProvider)

    const reportPending = () => {
        const tileProviderStats = tileManagerGroup.getStats()
        pending$.next(tileProviderStats.pending)
    }

    const loadTile$ = request => {
        const response$ = new ReplaySubject(1)
        const cancel$ = new Subject()
        const requestId = request.id
        tileManagerGroup.loadTile({tileProviderId, requestId, request, response$, cancel$})
        reportPending()
        return response$.pipe(
            first(),
            finalize(() => {
                cancel$.next()
                reportPending()
            })
        )
    }

    const releaseTile = requestId => {
        reportPending()
        tileManagerGroup.releaseTile(requestId)
    }

    const setHidden = hidden => {
        tileManagerGroup.setHidden(hidden)
    }

    const setEnabled = enabled => {
        tileManagerGroup.setEnabled(enabled)
    }

    const close = () => {
        tileManagerGroup.close()
    }

    return {
        loadTile$,
        releaseTile,
        setHidden,
        setEnabled,
        pending$,
        close
    }
}
