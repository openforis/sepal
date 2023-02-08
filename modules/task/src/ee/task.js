const ee = require('#sepal/ee')
const {interval, of, throwError, catchError, distinctUntilChanged, map, exhaustMap, switchMap, takeWhile, tap} = require('rxjs')
const {finalize} = require('#sepal/rxjs')
const MONITORING_FREQUENCY = 10000
const {UNSUBMITTED, READY, RUNNING, FAILED} = ee.data.ExportState
const log = require('#sepal/log').getLogger('ee')

const runTask$ = (task, description) => {
    const start$ = task =>
        ee.$({
            operation: `start task (${description})`,
            ee: (resolve, reject) =>
                ee.data.startProcessing(null, task.config_, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result.taskId)
                )
        })

    const status$ = (taskId, maxRetries) =>
        ee.$({
            operation: `get task status (${description}, ${taskId})`,
            ee: (resolve, reject) =>
                ee.data.getTaskStatus(taskId,
                    (status, error) => error
                        ? reject(error)
                        : resolve(status)
                ),
            maxRetries
        }).pipe(
            map(([status]) => status)
        )

    const cancel$ = (taskId, maxRetries) =>
        ee.$({
            operation: `cancel task (${description}, ${taskId})`,
            ee: (resolve, reject) =>
                ee.data.cancelTask(taskId,
                    (_canceled, error) => error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })

    const monitor$ = taskId =>
        interval(MONITORING_FREQUENCY).pipe(
            exhaustMap(() => status$(taskId)),
            switchMap(({state, error_message: error}) =>
                (error || state === FAILED)
                    ? throwError(() => new Error(error))
                    : of(state)
            ),
            distinctUntilChanged(),
            takeWhile(state => isRunning(state)),
            map(toProgress)
        )

    const toProgress = state => {
        switch (state) {
        case 'UNSUBMITTED':
            return {
                state,
                defaultMessage: 'Submitting export task to Google Earth Engine',
                messageKey: 'tasks.ee.export.pending'
            }
        case 'READY':
            return {
                state,
                defaultMessage: 'Waiting for Google Earth Engine to start export',
                messageKey: 'tasks.ee.export.ready'
            }
        case 'RUNNING':
            return {
                state,
                defaultMessage: 'Google Earth Engine is exporting',
                messageKey: 'tasks.ee.export.running'
            }
        default:
            throw Error(`Unknown state (${description}): ${state}`)
        }
    }

    const cleanup$ = taskId => {
        log.debug(() => `EE task cleanup starting (${description}, ${taskId})`)
        return status$(taskId, 0).pipe(
            map(({state}) => isRunning(state)),
            switchMap(running =>
                running
                    ? cancel$(taskId, 3).pipe(
                        map(() => true)
                    )
                    : of(false)
            ),
            tap(wasRunning =>
                log.info(`EE task ${wasRunning ? 'cancelled' : 'completed'} (${description}, ${taskId})`)
            ),
            catchError(error => {
                log.error(`EE task failed to cancel. Trying again, without loading status first (${description}, ${taskId})`, error)
                return cancel$(taskId, 0)
            })
        )
    }

    const isRunning = state => [UNSUBMITTED, READY, RUNNING].includes(state)

    return of(task).pipe(
        switchMap(task => start$(task)),
        switchMap(taskId => monitor$(taskId).pipe(
            finalize(() => cleanup$(taskId), `Cleanup EE task ${taskId}`)
        ))
    )
}

module.exports = runTask$
