import {finalize, interval, map, switchMap, takeLast, takeWhile, tap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'

import {cleanupExportTask$, completionError, isRunning} from './exportTaskCleanup.js'

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
        // Otherwise the task may still be running - run cleanup. The cleanup observable must be explicitly
        // subscribed here; a bare finalize callback would never execute it.
        finalize(() => {
            if (!terminal) {
                cleanupExportTask$({eeTaskId, description, status$, cancel$}).subscribe({
                    error: error => log.error(`EE export task cleanup failed (${description}, ${eeTaskId})`, error)
                })
            }
        })
    )
}

// Starts an EE table export to Drive and polls until the task reaches a terminal state, erroring unless that
// state is COMPLETED. If the observable is unsubscribed before then (interactive Batch calc cancelled, retried,
// panel-unmounted, or superseded), best-effort cancel the still-running EE task so it doesn't keep running
// server-side.
export const exportTableToDrive$ = ({collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority}) => {
    const task = ee.batch.Export.table.toDrive(
        collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority
    )
    return start$({task, description}).pipe(
        switchMap(eeTaskId => poll$({eeTaskId, description}))
    )
}
