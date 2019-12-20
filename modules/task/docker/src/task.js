const {concat} = require('rxjs')
const {switchMap, tap} = require('rxjs/operators')
const log = require('sepalLog')('task')
const http = require('sepalHttpClient')
const {sepalHost, sepalUsername, sepalPassword} = require('./config')

const tasks = {
    'image.sepal_export': require('./tasks/exportImage')
}

const submitTask = ({id, name, params}) => {
    console.log('Submitting task', {id, name})
    const task = tasks[name]
    if (!task)
        throw new Error(`Task doesn't exist: ${name}`)
    // stateChanged() to active before doing anything else
    // Create initial state
    // BehavioralSubject
    // Heartbeats - to prevent server from timing job out
    // Debounce - not to flood server with fast updates
    const task$ = task
        .submit$(id, params)
        .pipe(
            switchMap(progress => taskProgressed$(id, progress))
        )
    concat(
        stateChanged$(id, 'ACTIVE', 'USE A REASONABLE MESSAGE HERE'),
        task$
    ).subscribe({
        error: error => taskFailed(id, error),
        completed: () => taskCompleted
    })
}

const taskProgressed$ = (id, progress) => {
    log.debug(`${id}: Notifying Sepal server on progress`, progress)
    return http.postJson$(`https://${sepalHost}/tasks/task/${id}/state-updated`, {
        body: {
            statusDescription: progress
        },
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        tap(() => log.info(`${id}: Notified Sepal server on progress`, progress))
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
    log.debug(`${id}: Task completed`)
    const message = 'Completed' // TODO: Object with key etc.?
    stateChanged$(id, 'COMPLETED', message).subscribe({
        error: error => log.error(`${id}: Failed to notify Sepal server on completed task`, error),
        completed: () => log.info(`${id}: Notified Sepal server on completed task`)
    })
}

const stateChanged$ = (id, state, message) =>
    http.postForm$(`https://${sepalHost}/tasks/task/${id}/state-updated`, {
        body: {
            state: state,
            statusDescription: message
        },
        username: sepalUsername,
        password: sepalPassword
    })

module.exports = {submitTask}
