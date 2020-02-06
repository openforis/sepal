const {Subject, concat} = require('rxjs')
const {filter, map, share, takeUntil, tap} = require('rxjs/operators')
const {lastInWindow, repeating} = require('./rxjs/operators')
const log = require('sepal/log').getLogger('task')
const http = require('sepal/httpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')
const progress = require('root/progress')

const HEARTBEAT_RATE = 60 * 1000
const MAX_UPDATE_RATE = 60 * 1000

const cancelSubject$ = new Subject()
const cancelTask$ = cancelSubject$.pipe(share())

const tasks = {
    'image.asset_export': require('./tasks/imageAssetExport'),
    'image.sepal_export': require('./tasks/imageSepalExport'),
}

const submitTask = ({id, name, params}) => {
    log.info(msg(id, `Submitting ${name}`))
    const task = tasks[name]
    if (!task)
        throw new Error(msg(id, `Doesn't exist: ${name}`))

    const initialState$ = stateChanged$(id, 'ACTIVE', {
        messageKey: 'tasks.status.executing',
        defaultMessage: 'Executing...'
    })
    const task$ = task.submit$(id, params)
    const cancel$ = cancelTask$.pipe(
        filter(taskId => taskId === id)
    )
    const progress$ = concat(initialState$, task$).pipe(
        tap(progress => log.info(msg(id, progress.defaultMessage))),
        lastInWindow(MAX_UPDATE_RATE),
        repeating(progress => taskProgressed$(id, progress), HEARTBEAT_RATE),
        takeUntil(cancel$)
    )
    progress$.subscribe({
        error: error => taskFailed(id, error),
        complete: () => taskCompleted(id)
    })
}

const taskProgressed$ = (id, progress) => {
    log.debug(msg(id, `Notifying Sepal server on progress ${progress}`))
    return http.post$(`https://${sepalHost}/api/tasks/active`, {
        query: {progress: {[id]: progress.message}},
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() => log.trace(msg(id, `Notified Sepal server of progress ${progress}`)))
    )
}

const taskFailed = (id, error) => {
    log.error(msg(id, `Failed: `), error)
    const message = progress({
        defaultMessage: 'Failed to execute task: ',
        messageKey: 'tasks.status.failed',
        messageArgs: {error: String(error)}
    })
    stateChanged$(id, 'FAILED', message).subscribe({
        error: error => log.error(msg(id, `Failed to notify Sepal server on failed task`), error),
        completed: () => log.info(msg(id, `Notified Sepal server of failed task`))
    })
}

const taskCompleted = id => {
    log.info(msg(id, `Completed`))
    const message = progress({
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    })
    stateChanged$(id, 'COMPLETED', message).subscribe({
        error: error => log.error(msg(id, `Failed to notify Sepal server on completed task`), error),
        completed: () => log.info(msg(id, `Notified Sepal server of completed task`))
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
    log.info(msg(id, `Canceling task`))
    cancelTask$.next(id)
}

const msg = (id, msg) => `Task ${id}: ${msg}`

module.exports = {submitTask, cancelTask}
