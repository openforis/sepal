// task/index.js — task component lifecycle wiring. Owns the CancelTimedOutTasks scheduler;
// delegates the command/query surface to taskManager.js and the REST surface to tasksApi.js.
//
// start(): register the session-event consumers (WorkerSessionActivated → ExecuteTasksInSession,
// WorkerSessionClosed → FailTasksInSession) and schedule CancelTimedOutTasks (@1min, immediate
// first run). stop(): unregister the consumers + clear the scheduler.
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

const log = getLogger('worker/task')

const MINUTE_MS = 60_000

// scheduleFixedDelay(name, fn, intervalMs) — run fn once immediately, then every intervalMs.
// Errors are logged, never thrown (a failed run must not stop the schedule). Returns the timer.
const scheduleFixedDelay = (name, fn, intervalMs) => {
    const run = () =>
        Promise.resolve()
            .then(fn)
            .catch(error => log.error(`Scheduled job ${name} failed`, error))
    run() // initial delay 0
    return setInterval(run, intervalMs)
}

const createTaskComponent = ({taskManager}) => {
    let timers = []

    const start = () => {
        log.debug('Starting...')

        taskManager.registerSessionEventConsumers()

        timers.push(scheduleFixedDelay(
            'CancelTimedOutTasks', () => taskManager.cancelTimedOutTasks(), MINUTE_MS))

        log.info('Started')
    }

    const stop = () => {
        log.debug('Stopping...')
        taskManager.unregisterSessionEventConsumers()
        timers.forEach(clearInterval)
        timers = []
        log.info('Stopped')
    }

    return {
        taskManager,
        start,
        stop,
    }
}

export {createTaskComponent}
