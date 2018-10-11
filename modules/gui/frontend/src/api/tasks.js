import {get$, post$, postJson$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadAll$: () => get$('/api/tasks').pipe(toResponse),
    submit$: task => postJson$('/api/tasks', {body: task}),
    restart$: taskId => post$(`/api/tasks/task/${taskId}/execute`),
    cancel$: taskId => post$(`/api/tasks/task/${taskId}/cancel`),
    remove$: taskId => post$(`/api/tasks/task/${taskId}/remove`),
    removeAll$: () => post$('/api/tasks/remove')
}

const toResponse = map(e => e.response)
