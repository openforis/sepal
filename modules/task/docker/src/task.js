const {Subject, concat} = require('rxjs')
const {distinctUntilChanged, filter, map, takeUntil, tap} = require('rxjs/operators')
const {lastInWindow, repeating} = require('sepal/rxjs/operators')
const log = require('sepal/log').getLogger('task')
const http = require('sepal/httpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')
const _ = require('lodash')

const MIN_TIME_BETWEEN_NOTIFICATIONS = 1 * 1000
const MAX_TIME_BETWEEN_NOTIFICATIONS = 60 * 1000

const cancel$ = new Subject()

const tasks = {
    'image.asset_export': require('./tasks/imageAssetExport'),
    'image.sepal_export': require('./tasks/imageSepalExport'),
    'timeseries.download': require('./tasks/timeSeriesSepalExport')
}

const getTask = (id, name) => {
    const task = tasks[name]
    if (!task) {
        throw new Error(msg(id, `Doesn't exist: ${name}`))
    }
    return task
}

const submitTask = ({id, name, params}) => {
    log.info(msg(id, `Submitting ${name}`))

    const task = getTask(id, name)

    const cancelTask$ = cancel$.pipe(
        filter(taskId => taskId === id)
    )

    const initialState$ = stateChanged$(id, 'ACTIVE', {
        messageKey: 'tasks.status.executing',
        defaultMessage: 'Executing...'
    })

    const task$ = task.submit$(id, params)

    const progress$ = concat(initialState$, task$).pipe(
        distinctUntilChanged((p1, p2) => _.isEqual(
            _.pick(p1, ['defaultMessage', 'messageKey', 'messageArgs']),
            _.pick(p2, ['defaultMessage', 'messageKey', 'messageArgs'])
        )),
        tap(progress => log.info(msg(id, progress.defaultMessage))),
        // Prevent progress notification to Sepal more often than MIN_TIME_BETWEEN_NOTIFICATIONS millis
        // This is to prevent flooding Sepal with too many updates
        lastInWindow(MIN_TIME_BETWEEN_NOTIFICATIONS),
        // Make sure progress notification to Sepal is sent at least every MAX_TIME_BETWEEN_NOTIFICATIONS millis
        // This prevents Sepal from thinking something gone wrong. Essentially repeating the last message as heartbeats
        repeating(progress => taskProgressed$(id, progress), MAX_TIME_BETWEEN_NOTIFICATIONS),
        takeUntil(cancelTask$)
    )
    progress$.subscribe({
        error: error => taskFailed(id, error),
        complete: () => taskCompleted(id)
    })
}

const taskProgressed$ = (id, progress) => {
    if (!progress.defaultMessage || !progress.messageKey) {
        log.warn(msg(id, `Malformed progress. Must contain 'defaultMessage' and 'messageKey' properties: ${JSON.stringify(progress)}`))
        progress = {
            defaultMessage: 'Executing...',
            messageKey: 'tasks.status.executing'
        }
    }
    log.debug(() => msg(id, `Notifying progress update: ${progress.defaultMessage}`))
    return http.post$(`https://${sepalHost}/api/tasks/active`, {
        query: {progress: {[id]: progress}},
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() =>
            log.trace(() => msg(id, `Notified progress update: ${progress.defaultMessage}`))
        )
    )
}

const taskFailed = (id, error) => {
    log.error(msg(id, 'Failed: '), error)
    const message = {
        defaultMessage: 'Failed to execute task: ',
        messageKey: 'tasks.status.failed',
        messageArgs: {error: String(error)}
    }
    stateChanged$(id, 'FAILED', message).subscribe({
        error: error => log.error(msg(id, 'Failed to notify Sepal server on failed task'), error),
        completed: () => log.debug(msg(id, 'Notified Sepal server of failed task'))
    })
}

const taskCompleted = id => {
    log.info(msg(id, 'Completed'))
    const message = {
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    }
    stateChanged$(id, 'COMPLETED', message).subscribe({
        error: error => log.error(msg(id, 'Failed to notify Sepal server on completed task'), error),
        completed: () => log.debug(msg(id, 'Notified Sepal server of completed task'))
    })
}

const stateChanged$ = (id, state, message) => {
    log.debug(() => msg(id, `Notifying state change: ${state}`))
    return http.postForm$(`https://${sepalHost}/api/tasks/task/${id}/state-updated`, {
        body: {
            state,
            statusDescription: message
        },
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() => log.trace(() => msg(id, `Notified state change: ${state}`))),
        map(() => ({state, ...message}))
    )
}

const cancelTask = id => {
    log.info(msg(id, 'Canceling task'))
    cancel$.next(id)
}

const msg = (id, msg) => `Task ${id}: ${msg}`

module.exports = {submitTask, cancelTask}
