// AFTER-COMMIT: the state+description are persisted FIRST, and the side effects (session
// extension / closeSession) run ONLY after that persist completes — never inside it.
//
// The 3 guard branches, in order:
//   (a) incoming CANCELED while task NOT in [PENDING, ACTIVE, CANCELING]  → no-op (return null).
//   (b) incoming ACTIVE while task IS CANCELING                          → re-invoke CancelTask, no-op.
//   (c) incoming state != CANCELED while task NOT in [PENDING, ACTIVE]   → no-op (return null).
// Otherwise: persist update(state, statusDescription); after commit:
//   - if the updated task is terminal (failed/completed/canceled):
//       no pending/active tasks remain in the session → closeSession; else → extend.
//   - else (non-terminal) → extend.
//
// The extension is a ratchet, not just the sweep's task filter. Excluding sessions with a running
// task from the sweep is NOT the same as cancelling the expiry cycle: a session notified at T+0
// that then runs a three-hour task would leave protection with a notified_time three hours old and
// close on the very next sweep — a warning issued three hours before the user could act on it. As
// a ratchet, leaving task protection always starts a fresh cycle.

import {getLogger} from '#sepal/log'

import {sessionTag, taskTag} from '../../tag.js'
import {isActive, isCanceled, isCanceling, isCompleted, isFailed, isPending, State, update} from '../task.js'
import {cancelTask} from './cancelTask.js'

const log = getLogger('worker/updateTaskProgress')

const {ACTIVE, CANCELED} = State

const isTerminal = task => isFailed(task) || isCompleted(task) || isCanceled(task)

// _execute — the "transactional" phase: guards + persist. Returns the updated task, or null on a
// guard no-op (including the CANCELING re-cancel branch, which delegates to CancelTask here).
const _execute = async ({taskId, state, statusDescription}, deps) => {
    const {repo} = deps
    const task = await repo.getTask(taskId)
    log.debug(() => `Progress update for ${taskTag(task.id)} requested: ${state}`)
    if (state === CANCELED && !(isPending(task) || isActive(task) || isCanceling(task))) {
        log.info(`Cannot cancel ${taskTag(task.id)} unless PENDING, ACTIVE, or CANCELING`)
        return null
    } else if (state === ACTIVE && isCanceling(task)) {
        await cancelTask({taskId, username: task.username}, deps)
        return null
    } else if (state !== CANCELED && !(isPending(task) || isActive(task))) {
        log.info(`Cannot update state of ${taskTag(task.id)} unless PENDING or ACTIVE`)
        return null
    }

    const updatedTask = update(task, state, statusDescription)
    await repo.update(updatedTask)
    return updatedTask
}

// _afterCommit — the AFTER-COMMIT phase: extend / closeSession. Runs only after _execute's
// persist has completed.
const _afterCommit = async (updatedTask, {repo, sessionManager}) => {
    if (!updatedTask || !isTerminal(updatedTask)) {
        if (updatedTask) {
            await sessionManager.taskExtension(updatedTask.sessionId)
        }
        return
    }
    const tasksInSession = await repo.pendingOrActiveTasksInSession(updatedTask.sessionId)
    if (!tasksInSession.length) {
        log.debug(() => `No tasks left in ${sessionTag(updatedTask.sessionId)}, closing it`)
        await sessionManager.closeSession({sessionId: updatedTask.sessionId})
    } else {
        log.debug(() => `Tasks still in ${sessionTag(updatedTask.sessionId)}, will not close it`)
        await sessionManager.taskExtension(updatedTask.sessionId)
    }
}

// updateTaskProgress({taskId, state, statusDescription, username?}, deps) — persist THEN side
// effect. username is accepted for symmetry with the executor callback but never
// ownership-checked: the executor is a trusted caller.
const updateTaskProgress = async (command, deps) => {
    const updatedTask = await _execute(command, deps)
    await _afterCommit(updatedTask, deps)
    return updatedTask
}

export {_afterCommit, _execute, updateTaskProgress}
