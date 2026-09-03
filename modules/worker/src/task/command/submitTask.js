// getDefaultInstanceType() returns the InstanceType OBJECT — use ?.id for the string.
// params reaches the gateway as a JSON STRING; the persisted task keeps it as an object.

import crypto from 'crypto'

import {getLogger} from '#sepal/log'

import {sessionTag, taskTag} from '../../tag.js'
import {TASK_EXECUTOR} from '../../workerInstance/workerTypes.js'
import {isActiveSession} from '../session.js'
import {activate, createTask, State} from '../task.js'

const log = getLogger('worker/submitTask')

const submitTask = async (
    {username, recipeId, instanceType, operation, params = {}},
    {repo, sessionManager, workerGateway, clock}
) => {
    const resolvedInstanceType = instanceType ?? sessionManager.getDefaultInstanceType()?.id
    let session = await sessionManager.findPendingOrActiveSession({
        username, workerType: TASK_EXECUTOR, instanceType: resolvedInstanceType,
    })
    if (session) {
        log.debug(() => `Submitting task to existing ${sessionTag(session)}`)
    } else {
        session = await sessionManager.requestSession({
            username, workerType: TASK_EXECUTOR, instanceType: resolvedInstanceType,
        })
        log.debug(() => `No existing session, submitting task to newly created ${sessionTag(session)}`)
    }
    const now = clock()
    let task = createTask({
        id: crypto.randomUUID(),
        recipeId,
        state: State.PENDING,
        username,
        operation,
        params,
        sessionId: session.id,
        creationTime: now,
        updateTime: now,
    })
    if (isActiveSession(session)) {
        task = activate(task)
        log.debug(() => `Session is active, executing ${taskTag(task.id)}`)
        await workerGateway.execute({...task, params: JSON.stringify(task.params)}, session)
    } else {
        log.debug(() => `Session is not active, will not execute ${taskTag(task.id)}`)
    }
    await repo.insert(task)
    return task
}

export {submitTask}
