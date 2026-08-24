// recipeId is carried over to the re-submitted task (it is stored and echoed, never acted on).

import {InvalidCommand, Unauthorized} from '../errors.js'
import {isCanceled, isCompleted, isFailed} from '../task.js'

const resubmitTask = async ({username, taskId, instanceType}, deps) => {
    const {repo, sessionManager, submitTask} = deps
    const task = await repo.getTask(taskId)
    if (task.username !== username) {
        throw new Unauthorized(`Task not owned by user: ${task.id}`)
    }
    if (!(isCanceled(task) || isFailed(task) || isCompleted(task))) {
        throw new InvalidCommand('Only canceled, failed, and completed tasks can be resubmitted')
    }
    await repo.remove(task)
    const resolvedInstanceType = instanceType ?? sessionManager.getDefaultInstanceType()?.id
    return submitTask({
        username,
        instanceType: resolvedInstanceType,
        operation: task.operation,
        params: task.params,
        recipeId: task.recipeId,
    }, deps)
}

export {resubmitTask}
