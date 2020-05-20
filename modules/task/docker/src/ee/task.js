const ee = require('ee')
const {interval, of, throwError} = require('rxjs')
const {distinctUntilChanged, exhaustMap, first, finalize, map, switchMap, mapTo, takeWhile} = require('rxjs/operators')
const log = require('sepal/log').getLogger('task')

const MONITORING_FREQUENCY = 10000
const {UNSUBMITTED, READY, RUNNING, FAILED} = ee.data.ExportState

const executeTask$ = task =>
    start$(task).pipe(
        switchMap(() => monitor$(task)),
        finalize(() => task.id && cleanup(task))
    )

const monitor$ = task =>
    interval(MONITORING_FREQUENCY).pipe(
        exhaustMap(() => status$(task)),
        switchMap(({state, error_message: error}) => error
            ? throwError(new Error(error))
            : of(state)
        ),
        distinctUntilChanged(),
        takeWhile(state => isRunning(state)),
        map(state => {
            if (state === FAILED) {
                throw new Error()
            }
            return {name: state}
        })
    )

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
        next: wasRunning => log.debug(`EE task ${task.id}: ${wasRunning ? 'cancelled' : 'complete'}`),
        error: error => log.error('Failed to cancel EE task', error)
    })
}
        
const start$ = task =>
    ee.$('start task', (resolve, reject) =>
        ee.data.startProcessing(null, task.config_, ({taskId}, error) => {
            if (error) {
                reject(error)
            } else {
                task.id = taskId // [TODO] Solve this without mutation
                resolve()
            }
        })
    )

const status$ = task =>
    ee.$('task status', (resolve, reject) =>
        ee.data.getTaskStatus(task.id,
            (status, error) =>
                error ? reject(error) : resolve(status)
        )
    ).pipe(
        map(([status]) => status)
    )

const cancel$ = task =>
    ee.$('cancel task', (resolve, reject) => {
        ee.data.cancelTask(task.id,
            (canceled_, error) => error ? reject(error) : resolve())
    })

const isRunning = state => [UNSUBMITTED, READY, RUNNING].includes(state)

module.exports = {executeTask$}
