// TaskManager — in-proc task component surface. Binds each command/query handler to its injected
// collaborators (repo, sessionManager, workerGateway, clock) so callers invoke an argument-only
// surface, mirroring sessionManager.js.
//
// registerSessionEventConsumers() wires the in-proc seam:
//   WorkerSessionActivated {username, session} → ExecuteTasksInSession(toTaskSession(session))
//   WorkerSessionClosed    {username, sessionId} → FailTasksInSession(sessionId)
// These are registered by start(), not on import.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../tag.js'
import {workerSessionEvents as defaultSessionEvents} from '../workerSession/events.js'
import {cancelTask as _cancelTask} from './command/cancelTask.js'
import {cancelTimedOutTasks as _cancelTimedOutTasks} from './command/cancelTimedOutTasks.js'
import {cancelUserTasks as _cancelUserTasks} from './command/cancelUserTasks.js'
import {executeTasksInSession as _executeTasksInSession} from './command/executeTasksInSession.js'
import {failTasksInSession as _failTasksInSession} from './command/failTasksInSession.js'
import {removeTask as _removeTask} from './command/removeTask.js'
import {removeUserTasks as _removeUserTasks} from './command/removeUserTasks.js'
import {resubmitTask as _resubmitTask} from './command/resubmitTask.js'
import {submitTask as _submitTask} from './command/submitTask.js'
import {updateTaskProgress as _updateTaskProgress} from './command/updateTaskProgress.js'
import {getTask as _getTask} from './query/getTask.js'
import {userTasks as _userTasks} from './query/userTasks.js'
import {toTaskSession} from './session.js'

const log = getLogger('worker/taskManager')

const createTaskManager = ({
    repo,
    sessionManager,
    workerGateway,
    clock = () => new Date(),
    sessionEvents = defaultSessionEvents,
}) => {
    // submitTask needs a self-reference (resubmit + the manager both call it), so bundle deps once.
    const deps = {repo, sessionManager, workerGateway, clock}

    const submitTask = command => _submitTask(command, deps)
    // resubmit forwards submitTask so it re-submits through the same code path.
    const resubmitTask = command => _resubmitTask(command, {...deps, submitTask})
    const executeTasksInSession = session => _executeTasksInSession(session, deps)
    const cancelTask = command => _cancelTask(command, deps)
    const cancelTimedOutTasks = () => _cancelTimedOutTasks(deps)
    const cancelUserTasks = username => _cancelUserTasks(username, deps)
    const updateTaskProgress = command => _updateTaskProgress(command, deps)
    const removeTask = command => _removeTask(command, deps)
    const removeUserTasks = username => _removeUserTasks(username, deps)
    const failTasksInSession = command => _failTasksInSession(command, deps)

    // queries
    const userTasks = username => _userTasks(username, deps)
    const getTask = command => _getTask(command, deps)

    // ── in-proc session-event wiring ──────────────────────────────────────────────
    const onActivated = event =>
        executeTasksInSession(toTaskSession(event.session)).catch(error =>
            log.error(`ExecuteTasksInSession failed for ${sessionTag(event?.session)}`, error)
        )
    const onClosed = event =>
        failTasksInSession({sessionId: event.sessionId}).catch(error =>
            log.error(`FailTasksInSession failed for ${sessionTag(event?.sessionId)}`, error)
        )

    let registered = false
    const registerSessionEventConsumers = () => {
        if (registered) {
            return
        }
        sessionEvents.on('WorkerSessionActivated', onActivated)
        sessionEvents.on('WorkerSessionClosed', onClosed)
        registered = true
    }
    const unregisterSessionEventConsumers = () => {
        if (!registered) {
            return
        }
        sessionEvents.off('WorkerSessionActivated', onActivated)
        sessionEvents.off('WorkerSessionClosed', onClosed)
        registered = false
    }

    // start()/stop() seam — registers/unregisters the session-event consumers.
    // NOT auto-started on import.
    const start = () => registerSessionEventConsumers()
    const stop = () => unregisterSessionEventConsumers()

    return {
        // commands
        submitTask,
        resubmitTask,
        executeTasksInSession,
        cancelTask,
        cancelTimedOutTasks,
        cancelUserTasks,
        updateTaskProgress,
        removeTask,
        removeUserTasks,
        failTasksInSession,
        // queries
        userTasks,
        getTask,
        // lifecycle / wiring
        registerSessionEventConsumers,
        unregisterSessionEventConsumers,
        start,
        stop,
    }
}

export {createTaskManager}
