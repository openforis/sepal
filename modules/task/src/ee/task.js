const ee = require('#sepal/ee/ee')
const {interval, of, throwError, catchError, distinctUntilChanged, map, exhaustMap, switchMap, takeWhile, tap} = require('rxjs')
const {finalizeObservable} = require('#sepal/rxjs')
const MONITORING_FREQUENCY = 10000
const {UNSUBMITTED, READY, RUNNING, FAILED} = ee.data.ExportState
const log = require('#sepal/log').getLogger('ee')

const task$ = (taskId, task, description) => {
    const start$ = task =>
        ee.$({
            description: `start task (${description})`,
            operation: (resolve, reject) =>
                ee.data.startProcessing(null, task.config_, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result.taskId)
                )
        })

    const status$ = (eeTaskId, maxRetries) =>
        ee.$({
            description: `get task status (${description}, ${eeTaskId})`,
            operation: (resolve, reject) =>
                ee.data.getTaskStatus(eeTaskId,
                    (status, error) => error
                        ? reject(error)
                        : resolve(status)
                ),
            maxRetries
        }).pipe(
            map(([status]) => status)
        )

    const cancel$ = (eeTaskId, maxRetries) =>
        ee.$({
            description: `cancel task (${description}, ${eeTaskId})`,
            operation: (resolve, reject) =>
                ee.data.cancelTask(eeTaskId,
                    (_canceled, error) => error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })

    const monitor$ = eeTaskId =>
        interval(MONITORING_FREQUENCY).pipe(
            exhaustMap(() => status$(eeTaskId)),
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

    const cleanup$ = eeTaskId => {
        log.debug(() => `EE task cleanup starting (${description}, ${eeTaskId})`)
        return status$(eeTaskId, 0).pipe(
            map(({state}) => isRunning(state)),
            switchMap(running =>
                running
                    ? cancel$(eeTaskId, 3).pipe(
                        map(() => true)
                    )
                    : of(false)
            ),
            tap(wasRunning =>
                log.info(`EE task ${wasRunning ? 'cancelled' : 'completed'} (${description}, ${eeTaskId})`)
            ),
            catchError(error => {
                log.error(`EE task failed to cancel. Trying again, without loading status first (${description}, ${eeTaskId})`, error)
                return cancel$(eeTaskId, 0)
            })
        )
    }

    const isRunning = state => [UNSUBMITTED, READY, RUNNING].includes(state)

    return of(task).pipe(
        switchMap(task => start$(task)),
        switchMap(eeTaskId => monitor$(eeTaskId).pipe(
            finalizeObservable(
                () => cleanup$(eeTaskId),
                taskId,
                `Cleanup EE task ${eeTaskId}`
            )
        ))
    )
}

module.exports = {task$}
