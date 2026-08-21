import {finalize, interval, map, switchMap, takeLast, takeWhile, tap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'

import {cleanupExportTask$, completionError, isRunning} from './exportTaskCleanup.js'
import {startWithLateCleanup$} from './startWithLateCleanup.js'

const log = getLogger('ee/batch')

const POLL_FREQUENCY_MS = 2 * 1000

// Without callbacks a rejected submission escapes as a raw throw at construction time - outside the pipeline
// and unwrapped, so the caller gets "Internal error" instead of what Earth Engine said. This is NOT where a bad
// graph is caught: Earth Engine accepts those and fails the task while it runs. No retries - a submission
// Earth Engine refuses is deterministic.
const start$ = ({task, description}) =>
    ee.$({
        description: `start ${description} export task`,
        operation: (resolve, reject) => task.start(() => resolve(task.id), reject),
        maxRetries: 0
    })

const status$ = ({eeTaskId, description, maxRetries}) =>
    ee.$({
        description: `poll ${description} export task status`,
        operation: (resolve, reject) =>
            ee.data.getTaskStatus(eeTaskId,
                (status, error) => error ? reject(error) : resolve(status)
            ),
        maxRetries
    }).pipe(
        map(([status]) => status)
    )

const cancel$ = ({eeTaskId, description, maxRetries}) =>
    ee.$({
        description: `cancel ${description} export task`,
        operation: (resolve, reject) =>
            ee.data.cancelTask(eeTaskId,
                (_canceled, error) => error ? reject(error) : resolve()
            ),
        maxRetries
    })

// The only place cleanup is subscribed. Both phases that can abandon a task - a cancellation while the start
// is still pending, and one after polling has begun - go through this, so they cannot drift apart in what
// they cancel or how a failure to cancel is reported. The observable must be explicitly subscribed; a bare
// call would never execute it.
const cleanup = ({eeTaskId, description}) =>
    cleanupExportTask$({eeTaskId, description, status$, cancel$}).subscribe({
        error: error => log.error(`EE export task cleanup failed (${description}, ${eeTaskId})`, error)
    })

const poll$ = ({eeTaskId, description}) => {
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
        finalize(() => terminal || cleanup({eeTaskId, description}))
    )
}

// Starts an EE table export to Drive and polls until the task reaches a terminal state, erroring unless that
// state is COMPLETED. If the observable is unsubscribed before then (interactive Batch calc cancelled, retried,
// panel-unmounted, or superseded), best-effort cancel the still-running EE task so it doesn't keep running
// server-side - including when the cancellation lands in the window between submitting the export and being
// told its id, where there is a task but nothing has seen it yet.
export const exportTableToDrive$ = ({collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority}) => {
    const task = ee.batch.Export.table.toDrive(
        collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority
    )
    return startWithLateCleanup$({
        start$: start$({task, description}),
        onStartedAfterCancellation: eeTaskId => {
            log.info(`EE export task started after its request was cancelled (${description}, ${eeTaskId})`)
            cleanup({eeTaskId, description})
        }
    }).pipe(
        switchMap(eeTaskId => poll$({eeTaskId, description}))
    )
}
