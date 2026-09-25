// task events — in-proc change notifications for the task subsystem.
//
// taskChanged$ fires {username} whenever a task row is inserted, updated, or removed for that
// user. The ws push channel (task/ws.js) re-queries the user's task listing on each event.
//
// EventEmittingTaskRepository decorates the task repository so EVERY mutation emits AFTER its
// persist resolves — commands never emit directly, so any new command that persists through the
// repository is covered automatically. A rejected mutation does not emit.
//
// In-proc only (RxJS Subject) — no RabbitMQ publisher, matching the user-files/user-assets
// websocket channels which are also MQ-free.

import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

import {userTag} from '../tag.js'

const log = getLogger('worker/taskEvents')

export const taskChanged$ = new Subject()

// Every read is forwarded explicitly: spreading the repository would copy none of its operations,
// which live on the prototype.
export class EventEmittingTaskRepository {
    #taskRepository

    constructor(taskRepository) {
        this.#taskRepository = taskRepository
    }

    getTask(taskId) {
        return this.#taskRepository.getTask(taskId)
    }

    pendingOrActiveTasksInSession(sessionId) {
        return this.#taskRepository.pendingOrActiveTasksInSession(sessionId)
    }

    hasUnfinishedTasksInSession(sessionId) {
        return this.#taskRepository.hasUnfinishedTasksInSession(sessionId)
    }

    pendingOrActiveUserTasks(username) {
        return this.#taskRepository.pendingOrActiveUserTasks(username)
    }

    timedOutTasks() {
        return this.#taskRepository.timedOutTasks()
    }

    userTasks(username) {
        return this.#taskRepository.userTasks(username)
    }

    async insert(task) {
        const result = await this.#taskRepository.insert(task)
        emitTaskChanged(task.username)
        return result
    }

    async update(task) {
        const result = await this.#taskRepository.update(task)
        emitTaskChanged(task.username)
        return result
    }

    async remove(task) {
        const result = await this.#taskRepository.remove(task)
        emitTaskChanged(task.username)
        return result
    }

    async removeNonPendingOrActiveUserTasks(username) {
        const result = await this.#taskRepository.removeNonPendingOrActiveUserTasks(username)
        emitTaskChanged(username)
        return result
    }
}

export const emitTaskChanged = username => {
    log.debug(() => `Emitting TaskChanged for ${userTag(username)}`)
    taskChanged$.next({username})
}
