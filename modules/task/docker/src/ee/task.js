const ee = require('ee')
const {interval, of, throwError} = require('rxjs')
const {distinctUntilChanged, exhaustMap, first, finalize, map, switchMap, mapTo, takeWhile, tap} = require('rxjs/operators')
const log = require('sepal/log').getLogger('ee')

const MONITORING_FREQUENCY = 10000
const {UNSUBMITTED, READY, RUNNING, FAILED} = ee.data.ExportState

const executeTask$ = (task, description) => {
    const monitor$ = task =>
        interval(MONITORING_FREQUENCY).pipe(
            exhaustMap(() => status$(task)),
            switchMap(({state, error_message: error}) => error || state === FAILED
                ? throwError(new Error(error))
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
                throw Error(`Unknown state: ${state}`)
        }
    }

    const cleanup = task => {
        status$(task).pipe(
            map(({state}) => isRunning(state)),
            switchMap(running => running
                ? cancel$(task).pipe(
                    mapTo(true)
                )
                : of(false)
            ),
            first()
        ).subscribe({
            next: wasRunning => log.info(`EE task ${task.id}: ${wasRunning ? 'Cancelled' : 'Completed'} (${description})`),
            error: error => log.error('Failed to cancel EE task', error)
        })
    }

    const start$ = task =>
        ee.$({
            operation: `start task (${description})`,
            ee: (resolve, reject) =>
                ee.data.startProcessing(null, task.config_, (result, error) => {
                    if (error) {
                        reject(error)
                    } else {
                        task.id = result.taskId // [TODO] Solve this without mutation
                        resolve()
                    }
                })
        }).pipe(
            tap(() => log.info(`EE task ${task.id}: Started (${description})`))
        )

    const status$ = task =>
        ee.$({
            operation: `get task status (${description})`,
            ee: (resolve, reject) =>
                ee.data.getTaskStatus(task.id,
                    (status, error) => error ? reject(error) : resolve(status)
                )
        }).pipe(
            map(([status]) => status)
        )

    const cancel$ = task =>
        ee.$({
            operation: `cancel task (${description})`,
            ee: (resolve, reject) =>
                ee.data.cancelTask(task.id,
                    (_canceled, error) => error ? reject(error) : resolve()
                )
        })

    const isRunning = state => [UNSUBMITTED, READY, RUNNING].includes(state)

    return start$(task).pipe(
        switchMap(() => monitor$(task)),
        finalize(() => task.id && cleanup(task))
    )
}

module.exports = {executeTask$}
