const {Subject, EMPTY, merge, of, mergeMap, shareReplay, filter, tap, switchMap, catchError} = require('rxjs')
const log = require('#sepal/log').getLogger('task')
const executeTask$ = require('./taskRunner')
const {lastInWindow, repeating} = require('#sepal/rxjs')
const {post$} = require('#sepal/httpClient')
const {getConfig, switchedToServiceAccount$} = require('./context')
const {errorReport} = require('#sepal/exception')
const {tag} = require('#sepal/tag')

const taskTag = id => tag('Task', id)

const MIN_TIME_BETWEEN_NOTIFICATIONS = 1 * 1000
const MAX_TIME_BETWEEN_NOTIFICATIONS = 60 * 1000

const {sepalEndpoint, sepalUsername, sepalPassword} = getConfig()

const task$ = new Subject()
const cancel$ = new Subject()

const msg = (id, msg) => `${taskTag(id)}: ${msg}`

const submitTask = task => {
    log.debug(() => msg(task.id, 'submitted'))
    task$.next(task)
}

const cancelTask = id => {
    log.debug(msg(id, 'cancellation requested'))
    cancel$.next(id)
}

const taskStateChanged$ = (id, state, message) => {
    log.debug(() => msg(id, `notifying state change: ${state}`))
    return post$(`${sepalEndpoint}/api/tasks/task/${id}/state-updated`, {
        body: {
            state,
            statusDescription: message
        },
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        catchError(error => {
            log.error(msg(id, `could not notify state change: ${state}`), error)
            return EMPTY
        }),
        tap(() =>
            log.trace(() => msg(id, `notified state change: ${state}`))
        ),
        switchMap(() => EMPTY)
    )
}

const taskProgressed$ = (id, progress) => {
    log.debug(() => msg(id, `notifying progress update: ${progress.defaultMessage}`))
    return post$(`${sepalEndpoint}/api/tasks/active`, {
        query: {progress: {[id]: progress}},
        username: sepalUsername,
        password: sepalPassword
    }).pipe(
        catchError(error => {
            log.error(msg(id, `could not notify progress update: ${progress.defaultMessage}`), error)
            return EMPTY
        }),
        tap(() =>
            log.trace(() => msg(id, `notified progress update: ${progress.defaultMessage}`))
        ),
        switchMap(() => EMPTY)
    )
}

const taskFailed$ = (id, error) => {
    log.error(msg(id, errorReport(error)))
    return taskStateChanged$(id, 'FAILED', {
        defaultMessage: 'Failed to execute task: ',
        messageKey: 'tasks.status.failed',
        messageArgs: {error: String(error)}
    })
}

const taskCompleted$ = id =>
    taskStateChanged$(id, 'COMPLETED', {
        defaultMessage: 'Completed!',
        messageKey: 'tasks.status.completed'
    })

const taskCanceled$ = id =>
    taskStateChanged$(id, 'CANCELED', {
        defaultMessage: 'Stopped',
        messageKey: 'tasks.status.canceled'
    })

task$.pipe(
    mergeMap(task => {
        const taskCancellation$ = merge(
            cancel$.pipe(
                filter(id => id === task.id),
                tap(() => log.debug(msg(task.id, 'cancelled by user'))),
            ),
            switchedToServiceAccount$.pipe(
                tap(() => log.debug(msg(task.id, 'cancelled by switching to service account'))),
            )
        ).pipe(
            shareReplay()
        )
        return executeTask$({task, cmd$: taskCancellation$}).pipe(
            switchMap(progress =>
                progress.state === 'COMPLETED'
                    ? taskCompleted$(task.id)
                    : progress.state === 'CANCELED'
                        ? taskCanceled$(task.id)
                        : of(progress)
            ),
            catchError(error =>
                taskFailed$(task.id, error)
            ),
            // Prevent progress notification to Sepal more often than MIN_TIME_BETWEEN_NOTIFICATIONS millis
            // This is to prevent flooding Sepal with too many updates
            lastInWindow(MIN_TIME_BETWEEN_NOTIFICATIONS),
            // Make sure progress notification to Sepal is sent at least every MAX_TIME_BETWEEN_NOTIFICATIONS millis
            // This prevents Sepal from thinking something gone wrong. Essentially repeating the last message as heartbeats
            repeating(progress => taskProgressed$(task.id, progress), MAX_TIME_BETWEEN_NOTIFICATIONS),
        )
    })
).subscribe({
    // next: v => log.fatal('*** STATE', v),
    error: error => log.fatal('Task stream failed unexpectedly:', error),
    complete: () => log.fatal('Task stream completed unexpectedly')
})

module.exports = {submitTask, cancelTask}
