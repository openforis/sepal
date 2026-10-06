import {mkdir, readFile, rm, writeFile} from 'fs/promises'
import {join} from 'path'

const OUTCOMES = ['COMPLETED', 'FAILED', 'CANCELED']

// The directory a task's container mounts at /task: task-manager writes task.json before the container starts,
// and the container writes result.json before it exits.
export class TaskWorkspace {
    #dir

    constructor({dir}) {
        this.#dir = dir
    }

    async prepare(task) {
        const taskDir = join(this.#dir, task.id)
        await mkdir(taskDir, {recursive: true})
        await writeFile(join(taskDir, 'task.json'), JSON.stringify({id: task.id, operation: task.operation, params: task.params}))
    }

    async readResult(taskId) {
        try {
            const result = JSON.parse(await readFile(join(this.#dir, taskId, 'result.json'), 'utf8'))
            return OUTCOMES.includes(result?.state) ? result : null
        } catch (_error) {
            return null
        }
    }

    async remove(taskId) {
        await rm(join(this.#dir, taskId), {recursive: true, force: true})
    }
}
