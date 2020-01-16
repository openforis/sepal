const {Subject, concat} = require('rxjs')
const {filter, map, share, takeUntil, tap} = require('rxjs/operators')
const {lastInWindow, repeating} = require('./rxjs/operators')
const log = require('sepal/log')('task')
const http = require('sepal/httpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')

const HEARTBEAT_RATE = 1000
const MAX_UPDATE_RATE = 1000

const cancelSubject$ = new Subject()
const cancelTask$ = cancelSubject$.pipe(share())

const tasks = {
    'image.sepal_export': require('./tasks/exportImage')
}

const submitTask = ({id, name, params}) => {
    log.info(`${id}: Submitting task ${name}`)
    const task = tasks[name]
    if (!task)
        throw new Error(`Task doesn't exist: ${name}`)

    const initialState$ = stateChanged$(id, 'ACTIVE', {
        messageKey: 'tasks.status.executing',
        defaultMessage: 'Executing...'
    })
    const task$ = task.submit$(id, params)
    const cancel$ = cancelTask$.pipe(
        filter(taskId => taskId === id)
    )
    const progress$ = concat(initialState$, task$).pipe(
        lastInWindow(MAX_UPDATE_RATE),
        repeating(progress => taskProgressed$(id, progress), HEARTBEAT_RATE),
        takeUntil(cancel$)
    )
    progress$.subscribe({
        error: error => taskFailed(id, error),
        complete: () => taskCompleted(id) // TODO: How do we know if canceled or succeeded?
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
    }).pipe(
        map(() => message)
    )
}

const cancelTask = id => {
    log.info(`${id}: Canceling task`)
    cancelTask$.next(id)
}

module.exports = {submitTask, cancelTask}
