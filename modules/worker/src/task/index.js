// task/index.js — task component lifecycle wiring. Owns the CancelTimedOutTasks scheduler;
// delegates the command/query surface to taskManager.js and the REST surface to tasksApi.js.
//
// start(): register the session-event consumers (WorkerSessionActivated → ExecuteTasksInSession,
// WorkerSessionClosed → FailTasksInSession) and schedule CancelTimedOutTasks (@1min, immediate
// first run). stop(): unregister the consumers + clear the scheduler.
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {createScheduler} from '../scheduler.js'
import {MINUTE_MS} from '../time.js'

const log = getLogger('worker/task')

const createTaskComponent = ({taskManager}) => {
    const scheduler = createScheduler(log)

    const start = () => {
        log.debug('Starting...')

        taskManager.registerSessionEventConsumers()

        scheduler.schedule('CancelTimedOutTasks', () => taskManager.cancelTimedOutTasks(), MINUTE_MS)

        log.info('Started')
    }

    const stop = () => {
        log.debug('Stopping...')
        taskManager.unregisterSessionEventConsumers()
        scheduler.stopAll()
        log.info('Stopped')
    }

    return {
        taskManager,
        start,
        stop,
    }
}

export {createTaskComponent}
