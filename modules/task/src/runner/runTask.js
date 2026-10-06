import {getLogger} from '#sepal/log'

import {failureStatus} from './failureStatus.js'

const log = getLogger('task')

const EXECUTING = {messageKey: 'tasks.status.executing', defaultMessage: 'Executing...'}
const COMPLETED = {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'}}
const CANCELED = {state: 'CANCELED', statusDescription: {messageKey: 'tasks.status.canceled', defaultMessage: 'Canceled.'}}

export const runTask = async ({task, operations, sepal, report, signal}) => {
    const operation = operations[task.operation]
    if (!operation) {
        log.error(`Task ${task.id}: unknown operation ${task.operation}`)
        return {state: 'FAILED', statusDescription: failureStatus(null)}
    }
    report(EXECUTING)
    try {
        await operation(task.params, {sepal, report, signal})
        return signal.aborted ? CANCELED : COMPLETED
    } catch (error) {
        if (signal.aborted) {
            return CANCELED
        }
        log.error(`Task ${task.id} failed`, error)
        return {state: 'FAILED', statusDescription: failureStatus(error)}
    }
}
