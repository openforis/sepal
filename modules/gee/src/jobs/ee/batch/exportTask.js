import {finalize, interval, map, switchMap, takeLast, takeWhile, tap} from 'rxjs'

import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'

import {cleanupExportTask$, isRunning} from './exportTaskCleanup.js'

const log = getLogger('ee/batch')

const POLL_FREQUENCY_MS = 2 * 1000

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

// Starts an EE table export to Drive and polls until the task reaches a terminal state. If the observable
// is unsubscribed before then (interactive Batch calc cancelled, retried, panel-unmounted, or superseded),
// best-effort cancel the still-running EE task so it doesn't keep running server-side.
export const exportTableToDrive$ = ({collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority}) => {
    const task = ee.batch.Export.table.toDrive(
        collection, description, folder, fileNamePrefix, fileFormat, selectors, maxVertices, priority
    )
    task.start()
    const eeTaskId = task.id
    let terminal = false
    return interval(POLL_FREQUENCY_MS).pipe(
        switchMap(() => status$({eeTaskId, description})),
        takeWhile(({state}) => isRunning(state), true),
        tap(({state}) => {
            terminal = !isRunning(state)
        }),
        takeLast(1),
        // finalize runs on completion, error, and unsubscribe. On normal completion `terminal` is set, so
        // cleanup is skipped. Otherwise the task may still be running - run cleanup. The cleanup observable
        // must be explicitly subscribed here; a bare finalize callback would never execute it.
        finalize(() => {
            if (!terminal) {
                cleanupExportTask$({eeTaskId, description, status$, cancel$}).subscribe({
                    error: error => log.error(`EE export task cleanup failed (${description}, ${eeTaskId})`, error)
                })
            }
        })
    )
}
