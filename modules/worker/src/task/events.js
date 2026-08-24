// task events — in-proc change notifications for the task subsystem.
//
// taskChanged$ fires {username} whenever a task row is inserted, updated, or removed for that
// user. The ws push channel (task/ws.js) re-queries the user's task listing on each event.
//
// withTaskChangedEvents(repo) decorates the task repository so EVERY mutation emits AFTER its
// persist resolves — commands never emit directly, so any new command that persists through the
// repository is covered automatically. A rejected mutation does not emit.
//
// In-proc only (RxJS Subject) — no RabbitMQ publisher, matching the user-files/user-assets
// websocket channels which are also MQ-free.

import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

import {userTag} from '../tag.js'

const log = getLogger('worker/taskEvents')

const taskChanged$ = new Subject()

const emitTaskChanged = username => {
    log.debug(() => `Emitting TaskChanged for ${userTag(username)}`)
    taskChanged$.next({username})
}

const withTaskChangedEvents = repo => ({
    ...repo,
    insert: async task => {
        const result = await repo.insert(task)
        emitTaskChanged(task.username)
        return result
    },
    update: async task => {
        const result = await repo.update(task)
        emitTaskChanged(task.username)
        return result
    },
    remove: async task => {
        const result = await repo.remove(task)
        emitTaskChanged(task.username)
        return result
    },
    removeNonPendingOrActiveUserTasks: async username => {
        const result = await repo.removeNonPendingOrActiveUserTasks(username)
        emitTaskChanged(username)
        return result
    },
})

export {emitTaskChanged, taskChanged$, withTaskChangedEvents}
