// For each of the user's PENDING/ACTIVE tasks → CancelTask. Each cancel is isolated so one
// failure does not abort the rest.

import {getLogger} from '#sepal/log'

import {taskTag} from '../../tag.js'
import {cancelTask} from './cancelTask.js'

const log = getLogger('worker/cancelUserTasks')

const cancelUserTasks = async (username, deps) => {
    const {repo} = deps
    const tasks = await repo.pendingOrActiveUserTasks(username)
    for (const task of tasks) {
        try {
            await cancelTask({taskId: task.id, username}, deps)
        } catch (error) {
            log.warn(`Failed to cancel ${taskTag(task.id)}`, error)
        }
    }
}

export {cancelUserTasks}
