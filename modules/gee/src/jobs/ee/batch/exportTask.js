import {defer, finalize, interval, map, switchMap, takeLast, takeWhile, tap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {currentEEContext, inEEContext} from '#sepal/ee/eeContext'
import {getLogger} from '#sepal/log'

import {cleanupExportTask$, completionError, isRunning} from './exportTaskCleanup.js'
import {startWithLateCleanup$} from './startWithLateCleanup.js'

const log = getLogger('ee/batch')

const POLL_FREQUENCY_MS = 2 * 1000

// Starts an EE table export to Drive and polls until the task reaches a terminal state, erroring unless that
// state is COMPLETED. If the observable is unsubscribed before then (interactive Batch calc cancelled, retried,
// panel-unmounted, or superseded), best-effort cancel the still-running EE task so it doesn't keep running
// server-side - including when the cancellation lands in the window between submitting the export and being
// told its id, where there is a task but nothing has seen it yet.
export const exportTableToDrive$ = ({collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority}) =>
    defer(() => {
        const context = currentEEContext()
        const task = ee.batch.Export.table.toDrive(
            collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority
        )
        return startWithLateCleanup$({
            start$: ee.startTableExport$(task, `start ${description} export task`),
            onStartedAfterCancellation: eeTaskId => {
                log.info(`EE export task started after its request was cancelled (${description}, ${eeTaskId})`)
                cleanup({eeTaskId, description, context})
            }
        }).pipe(
            switchMap(eeTaskId => poll$({eeTaskId, description, context}))
        )
    })

const status$ = ({eeTaskId, description, maxRetries}) =>
    ee.getTaskStatus$(eeTaskId, `poll ${description} export task status`, maxRetries)

const cancel$ = ({eeTaskId, description, maxRetries}) =>
    ee.cancelTask$(eeTaskId, `cancel ${description} export task`, maxRetries)

// The only place cleanup is subscribed. Both phases that can abandon a task - a cancellation while the start
// is still pending, and one after polling has begun - go through this, so they cannot drift apart in what
// they cancel or how a failure to cancel is reported. Abandoning is decided outside the request, so cleanup is
// made as the request that started the export. The observable must be explicitly subscribed; a bare call
// would never execute it.
const cleanup = ({eeTaskId, description, context}) =>
    inEEContext(context, cleanupExportTask$({eeTaskId, description, status$, cancel$})).subscribe({
        error: error => log.error(`EE export task cleanup failed (${description}, ${eeTaskId})`, error)
    })

const poll$ = ({eeTaskId, description, context}) => {
    let terminal = false
    return interval(POLL_FREQUENCY_MS).pipe(
        switchMap(() => status$({eeTaskId, description})),
        takeWhile(({state}) => isRunning(state), true),
        tap(({state}) => {
            terminal = !isRunning(state)
        }),
        takeLast(1),
        map(status => {
            const error = completionError({status, description})
            if (error) {
                throw error
            }
            return status
        }),
        // finalize runs on completion, error, and unsubscribe. Every terminal state sets `terminal`, including
        // the ones that error above, so cleanup is skipped for anything Earth Engine has already finished.
        // Otherwise the task may still be running - run cleanup.
        finalize(() => terminal || cleanup({eeTaskId, description, context}))
    )
}
