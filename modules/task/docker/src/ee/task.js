const ee = require('ee')
const {EMPTY, interval, of, throwError} = require('rxjs')
const {distinctUntilChanged, exhaustMap, filter, finalize, map, switchMap, takeWhile, tap} = require('rxjs/operators')
const log = require('sepal/log').getLogger('task')
const progress = require('root/progress')

const MONITORING_FREQUENCY = 1000
const {UNSUBMITTED, READY, RUNNING, FAILED} = ee.data.ExportState

const executeTask$ = task =>
    start$(task).pipe(
        switchMap(() => monitor$(task)),
        finalize(() => task.id && cancel(task))
    )

const start$ = task =>
    ee.$('start task', (resolve, reject) =>
        task.start(
            () => resolve(),
            error => reject(error)
        )
    )

const monitor$ = task =>
    interval(MONITORING_FREQUENCY).pipe(
        exhaustMap(() => status$(task)),
        switchMap(({state, error_message: error}) => error
            ? throwError(new Error(error))
            : of(state)
        ),
        distinctUntilChanged(),
        takeWhile(status => isRunning(status)),
        switchMap(status => progress$(status))
    )

const status$ = task =>
    ee.$('task status', (resolve, reject) =>
        ee.data.getTaskStatus(task.id,
            (status, error) => error ? reject(error) : resolve(status)
        )
    ).pipe(
        map(([status]) => status)
    )

const cancel = task =>
    status$(task).pipe(
        filter(({state}) => isRunning(state)),
        switchMap(() => cancel$(task))
    ).subscribe({
        error: error => log.error('Failed to cancel task', error),
        complete: () => log.debug('Cancelled task', task),
    })

const cancel$ = task =>
    ee.$('cancel task', (resolve, reject) => {
        ee.data.cancelTask(task.id,
            (canceled_, error) => error ? reject(error) : resolve())
    })

const isRunning = state => [UNSUBMITTED, READY, RUNNING].includes(state)

const progress$ = state => {
    switch (state) {
        case UNSUBMITTED:
            return of(progress({
                defaultMessage: 'Submitting export task to Google Earth Engine...',
                messageKey: 'tasks.ee.export.pending'
            }))
        case READY:
            return of(progress({
                defaultMessage: 'Waiting for Google Earth Engine to start export...',
                messageKey: 'tasks.ee.export.ready'
            }))
        case RUNNING:
            return of(progress({
                defaultMessage: 'Google Earth Engine is exporting...',
                messageKey: 'tasks.ee.export.running'
            }))
        case FAILED:
            return throwError(new Error(''))
        default:
            return EMPTY
    }
}

module.exports = {executeTask$}
