const {Subject, concat} = require('rxjs')
const {filter, map, takeUntil, tap} = require('rxjs/operators')
const {lastInWindow, repeating} = require('sepal/operators')
const log = require('sepal/log').getLogger('task')
const http = require('sepal/httpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')
const progress = require('root/progress')
const format = require('./format')

const MIN_UPDATE_PERIOD = 1 * 1000
const MAX_UPDATE_PERIOD = 60 * 1000

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
        lastInWindow(MIN_UPDATE_PERIOD),
        repeating(state => taskProgressed$(id, state), MAX_UPDATE_PERIOD),
        takeUntil(cancelTask$)
    )
    progress$.subscribe({
        error: error => taskFailed(id, error),
        complete: () => taskCompleted(id)
    })
}

const taskProgressed$ = (id, state) => {
    const progress = getProgress(state)
    log.debug(() => msg(id, `Notifying progress update: ${progress.defaultMessage}`))
    return http.post$(`https://${sepalHost}/api/tasks/active`, {
        query: {progress: {[id]: progress}},
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() =>
            log.trace(() => msg(id, `Notified progress update: ${state}`))
        )
    )
}

const taskFailed = (id, error) => {
    log.error(msg(id, 'Failed: '), error)
    const message = progress({
        defaultMessage: 'Failed to execute task: ',
        messageKey: 'tasks.status.failed',
        messageArgs: {error: String(error)}
    })
    stateChanged$(id, 'FAILED', message).subscribe({
        error: error => log.error(msg(id, 'Failed to notify Sepal server on failed task'), error),
        completed: () => log.info(msg(id, 'Notified Sepal server of failed task'))
    })
}

const taskCompleted = id => {
    log.info(msg(id, 'Completed'))
    const message = progress({
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    })
    stateChanged$(id, 'COMPLETED', message).subscribe({
        error: error => log.error(msg(id, 'Failed to notify Sepal server on completed task'), error),
        completed: () => log.info(msg(id, 'Notified Sepal server of completed task'))
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
        map(() => ({name: state}))
    )
}

const getProgress = ({name, data}) => {
    switch(name) {
    case 'ACTIVE':
        return progress({
            defaultMessage: 'Starting',
            messageKey: 'tasks.status.executing'
        })
    case 'UNSUBMITTED':
        return progress({
            defaultMessage: 'Submitting export task to Google Earth Engine',
            messageKey: 'tasks.ee.export.pending'
        })
    case 'READY':
        return progress({
            defaultMessage: 'Waiting for Google Earth Engine to start export',
            messageKey: 'tasks.ee.export.ready'
        })
    case 'RUNNING':
        return progress({
            defaultMessage: 'Google Earth Engine is exporting',
            messageKey: 'tasks.ee.export.running'
        })
    case 'DOWNLOADING':
        return progress({
            defaultMessage: `Downloading - ${data.files} files / ${format.fileSize(data.bytes)} left`,
            messageKey: 'tasks.ee.export.running'
        })
    }
}

const cancelTask = id => {
    log.info(msg(id, 'Canceling task'))
    cancel$.next(id)
}

const msg = (id, msg) => `Task ${id}: ${msg}`

module.exports = {submitTask, cancelTask}
