import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {getLogger} from '#sepal/log'

import {usesStaging} from './operations.js'

const log = getLogger('workspace')

const OUTCOMES = ['COMPLETED', 'FAILED', 'CANCELED']

// The directories a task's container mounts. At /task: task-manager writes task.json before the container starts,
// and the container writes result.json before it exits. At /staging, for operations that stage files: an empty
// folder the container's start script hands to the user, removed with the task directory.
export class TaskWorkspace {
    #dir
    #stagingDir

    constructor({dir, stagingDir}) {
        this.#dir = dir
        this.#stagingDir = stagingDir
    }

    async prepare(task) {
        const taskDir = join(this.#dir, task.id)
        await mkdir(taskDir, {recursive: true})
        await writeFile(join(taskDir, 'task.json'), JSON.stringify({id: task.id, operation: task.operation, params: task.params}))
        if (usesStaging(task.operation)) {
            await mkdir(join(this.#stagingDir, task.id), {recursive: true, mode: 0o700})
        }
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
        await this.#removeStaging(taskId)
        await rm(join(this.#dir, taskId), {recursive: true, force: true})
    }

    async removeAllExcept(taskIds) {
        const kept = new Set(taskIds)
        const leftovers = new Set([...await entries(this.#dir), ...await entries(this.#stagingDir)])
        for (const taskId of leftovers) {
            if (!kept.has(taskId)) {
                log.info(`Removing the directories of task ${taskId}: it no longer runs`)
                await this.remove(taskId)
                    .catch(error => log.error(`Could not remove the directory of task ${taskId}`, error))
            }
        }
    }

    // Staging that outlives its task costs storage, but never the task's outcome.
    async #removeStaging(taskId) {
        try {
            await rm(join(this.#stagingDir, taskId), {recursive: true, force: true})
        } catch (error) {
            log.error(`Could not remove the staging folder of task ${taskId}`, error)
        }
    }
}

const entries = async dir => {
    try {
        return await readdir(dir)
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error
        }
        return []
    }
}
