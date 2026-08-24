import {getLogger} from '#sepal/log'

import {taskTag} from '../../tag.js'
import {Unauthorized} from '../errors.js'
import {toTaskSession} from '../session.js'
import {canceling, isActive, isCanceling, isPending} from '../task.js'

const log = getLogger('worker/cancelTask')

const cancelTask = async ({taskId, username}, {repo, sessionManager, workerGateway}) => {
    const task = await repo.getTask(taskId)
    if (task.username && username && task.username !== username) {
        throw new Unauthorized(`Task not owned by user: ${task.id}`)
    }
    if (!(isPending(task) || isActive(task) || isCanceling(task))) {
        log.info(`Cannot update state of ${taskTag(task.id)} unless PENDING, ACTIVE, or CANCELING`)
        return null
    }

    const cancelingTask = canceling(task)
    await repo.update(cancelingTask)
    if (!isPending(task)) {
        const session = toTaskSession(await sessionManager.findSessionById(task.sessionId))
        await cancelTaskInWorker(task, session, workerGateway)
    }
    return cancelingTask
}

const cancelTaskInWorker = async (task, session, workerGateway) => {
    try {
        await workerGateway.cancel(task.id, session)
    } catch (error) {
        log.warn(`Failed to cancel ${taskTag(task.id)} in worker`, error)
    }
}

export {cancelTask}
