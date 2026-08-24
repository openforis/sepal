import {InvalidCommand, Unauthorized} from '../errors.js'
import {isCanceled, isCompleted, isFailed} from '../task.js'

const removeTask = async ({taskId, username}, {repo}) => {
    const task = await repo.getTask(taskId)
    if (task.username !== username) {
        throw new Unauthorized(`Task not owned by user: ${task.id}`)
    }
    if (!(isCanceled(task) || isFailed(task) || isCompleted(task))) {
        throw new InvalidCommand('Only canceled, failed, and completed tasks can be removed')
    }
    await repo.remove(task)
    return null
}

export {removeTask}
