// params reaches the gateway as a JSON STRING, not as the object the task carries.

import {getLogger} from '#sepal/log'

import {taskTag} from '../../tag.js'
import {activate, fail} from '../task.js'

const log = getLogger('worker/executeTasksInSession')

const executeTasksInSession = async (session, {repo, sessionManager, workerGateway}) => {
    const tasks = await repo.pendingOrActiveTasksInSession(session.id)
    for (const task of tasks) {
        await executeTask(task, session, {repo, sessionManager, workerGateway})
    }
}

const executeTask = async (task, session, {repo, sessionManager, workerGateway}) => {
    try {
        await workerGateway.execute({...task, params: JSON.stringify(task.params)}, session)
        await repo.update(activate(task))
    } catch (error) {
        log.error(`Failed to submit ${taskTag(task.id)}`, error)
        await repo.update(fail(task, 'Failed to submit task'))
        const tasksInSession = await repo.pendingOrActiveTasksInSession(task.sessionId)
        if (!tasksInSession.length) {
            log.debug('No tasks in session, closing session')
            await sessionManager.closeSession({sessionId: task.sessionId})
        }
    }
}

export {executeTasksInSession}
