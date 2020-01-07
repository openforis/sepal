const {Subject, concat, interval} = require('rxjs')
const {exhaustMap, finalize, last, switchMap, takeUntil, tap, windowTime} = require('rxjs/operators')
const log = require('sepalLog')('task')
const http = require('sepalHttpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')

const HEARTBEAT_RATE = 1000
const MAX_UPDATE_RATE = 1000

const tasks = {
    'image.sepal_export': require('./tasks/exportImage')
}
const submitTask = ({id, name, params}) => {
    console.log('Submitting task', {id, name})
    const task = tasks[name]
    if (!task)
        throw new Error(`Task doesn't exist: ${name}`)

    const task$ = task.submit$(id, params)
    const taskCompleted$ = new Subject()
    concat(
        stateChanged$(id, 'ACTIVE', {
            messageKey: 'tasks.status.executing',
            defaultMessage: 'Executing...'
        }),
        task$
            .pipe(
                finalize(() => taskCompleted$.next(true)),
                windowTime(MAX_UPDATE_RATE),
                switchMap(window$ => window$.pipe(last())),
                switchMap(progress =>
                    interval(HEARTBEAT_RATE).pipe(
                        exhaustMap(() => taskProgressed$(id, progress)),
                        takeUntil(taskCompleted$)
                    )
                )
            )
    ).subscribe({
        error: error => taskFailed(id, error),
        complete: () => taskCompleted(id)
    })
}

const taskProgressed$ = (id, progress) => {
    log.info(`${id}: Notifying Sepal server on progress`, progress)
    return http.post$(`https://${sepalHost}/api/tasks/active`, {
        query: {progress: {[id]: progress.message}},
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() => log.info(`${id}: Notified Sepal server of progress`, progress))
    )
}

const taskFailed = (id, error) => {
    log.error(`${id}: Task failed`, error)
    const message = 'Failed' // TODO: Object with key etc.?
    stateChanged$(id, 'FAILED', message).subscribe({
        error: error => log.error(`${id}: Failed to notify Sepal server on failed task`, error),
        completed: () => log.info(`${id}: Notified Sepal server of failed task`)
    })
}

const taskCompleted = id => {
    log.info(`${id}: Task completed`)
    const message = 'Completed' // TODO: Object with key etc.?
    stateChanged$(id, 'COMPLETED', message).subscribe({
        error: error => log.error(`${id}: Failed to notify Sepal server on completed task`, error),
        completed: () => log.info(`${id}: Notified Sepal server of completed task`)
    })
}

const stateChanged$ = (id, state, message) => {
    return http.postForm$(`https://${sepalHost}/api/tasks/task/${id}/state-updated`, {
        body: {
            state: state,
            statusDescription: message
        },
        username: sepalUsername,
        password: sepalPassword
    })
}

module.exports = {submitTask}
