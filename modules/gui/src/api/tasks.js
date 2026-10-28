import {get$, post$, postJson$} from '~/http-client'
import {uuid} from '~/uuid'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('task-manager/task'),

    loadDetails$: taskId =>
        get$(`/api/tasks/task/${taskId}/details`),

    // The id makes a retry after a failed response return the task already created instead of creating another.
    submit$: task =>
        postJson$('/api/tasks', {
            body: {id: uuid(), ...task}
        }),

    restart$: taskId =>
        post$(`/api/tasks/task/${taskId}/execute`),

    cancel$: taskId =>
        post$(`/api/tasks/task/${taskId}/cancel`),

    remove$: taskId =>
        post$(`/api/tasks/task/${taskId}/remove`),

    removeFinished$: taskIds =>
        postJson$('/api/tasks/remove', {
            body: {taskIds}
        })
}
