import {get$, post$, postJson$} from '~/http-client'

export default {
    loadAll$: () =>
        get$('/api/tasks'),

    submit$: task =>
        postJson$('/api/tasks', {
            body: task
        }),

    restart$: taskId =>
        post$(`/api/tasks/task/${taskId}/execute`),

    cancel$: taskId =>
        post$(`/api/tasks/task/${taskId}/cancel`),

    remove$: taskId =>
        post$(`/api/tasks/task/${taskId}/remove`),

    removeAll$: () =>
        post$('/api/tasks/remove')
}
