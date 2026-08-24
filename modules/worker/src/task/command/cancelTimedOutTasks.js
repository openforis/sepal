import {getLogger} from '#sepal/log'

import {taskTag} from '../../tag.js'
import {toTaskSession} from '../session.js'
import {canceled, fail, isActive, isCanceling} from '../task.js'

const log = getLogger('worker/cancelTimedOutTasks')

// isolate — run an async op, logging and swallowing any failure: one failure must not abort the rest.
const isolate = async (label, fn) => {
    try {
        return await fn()
    } catch (error) {
        log.warn(`Failed during ${label}`, error)
        return null
    }
}

const cancelTimedOutTasks = async ({repo, sessionManager, workerGateway}) => {
    const timedOutTasks = await repo.timedOutTasks()

    for (const task of timedOutTasks) {
        await isolate(`update ${task.id}`, () => {
            if (isCanceling(task)) {
                log.warn(`Canceling ${taskTag(task.id)} timed out`)
                return repo.update(canceled(task))
            }
            log.warn(`Updating state of timed out ${taskTag(task.id)} to failed`)
            return repo.update(fail(task))
        })
    }

    const sessionById = new Map()
    for (const task of timedOutTasks) {
        if (task.sessionId && !sessionById.has(task.sessionId)) {
            const session = await isolate(`findSession ${task.sessionId}`,
                async () => toTaskSession(await sessionManager.findSessionById(task.sessionId)))
            sessionById.set(task.sessionId, session)
        }
    }

    for (const task of timedOutTasks.filter(isActive)) {
        await isolate(`cancel ${task.id}`, () => workerGateway.cancel(task.id, sessionById.get(task.sessionId)))
    }

    for (const sessionId of sessionById.keys()) {
        const tasksInSession = await isolate(`tasksInSession ${sessionId}`,
            () => repo.pendingOrActiveTasksInSession(sessionId))
        if (tasksInSession && !tasksInSession.length) {
            await isolate(`closeSession ${sessionId}`, () => sessionManager.closeSession({sessionId}))
        }
    }
}

export {cancelTimedOutTasks}
