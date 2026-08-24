import {getLogger} from '#sepal/log'

import {taskTag} from '../../tag.js'
import {fail} from '../task.js'

const log = getLogger('worker/failTasksInSession')

const failTasksInSession = async ({sessionId, description}, {repo}) => {
    const tasks = await repo.pendingOrActiveTasksInSession(sessionId)
    for (const task of tasks) {
        log.warn(`Updating state of ${taskTag(task.id)} to failed: ${description}`)
        await repo.update(fail(task, description))
    }
    return null
}

export {failTasksInSession}
