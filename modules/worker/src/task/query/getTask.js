import {Unauthorized} from '../errors.js'

const getTask = async ({taskId, username}, {repo}) => {
    const task = await repo.getTask(taskId)
    if (task.username !== username) {
        throw new Unauthorized(`Task not owned by user: ${task.id}`)
    }
    return task
}

export {getTask}
