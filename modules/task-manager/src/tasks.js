import {randomUUID} from 'crypto'

import {getLogger} from '#sepal/log'

import {hashApiKey} from './apiKey.js'
import {InvalidCommand, NotFound, Unauthorized} from './errors.js'
import {createTask, isFinished, State, statusDescriptionOf} from './task.js'

const log = getLogger('tasks')

export class Tasks {
    #repository
    #supervisor
    #clock
    #newId

    constructor({repository, supervisor, clock = () => new Date(), newId = randomUUID}) {
        this.#repository = repository
        this.#supervisor = supervisor
        this.#clock = clock
        this.#newId = newId
    }

    async submit({username, operation, params = {}, recipeId = null}) {
        if (!operation) {
            throw new InvalidCommand('operation required')
        }
        const now = this.#clock()
        const task = createTask({
            id: this.#newId(),
            state: State.PENDING,
            username,
            operation,
            params: typeof params === 'string' ? JSON.parse(params) : params,
            recipeId,
            creationTime: now,
            updateTime: now
        })
        await this.#repository.insert(task)
        this.#supervisor.dispatch().catch(error => log.error('Dispatch failed', error))
        return task
    }

    async getTask({taskId, username}) {
        const task = await this.#repository.getTask(taskId)
        if (!task) {
            throw new NotFound(`No such task: ${taskId}`)
        }
        if (task.username !== username) {
            throw new Unauthorized(`Task not owned by user: ${taskId}`)
        }
        return task
    }

    userTasks(username) {
        return this.#repository.userTasks(username)
    }

    async cancel({taskId, username}) {
        const task = await this.getTask({taskId, username})
        if (task.state === State.PENDING
            && await this.#repository.transition(task, {from: [State.PENDING], to: State.CANCELED})) {
            return
        }
        if (await this.#repository.transition(task, {from: [State.ACTIVE], to: State.CANCELING})) {
            this.#supervisor.stopContainer(task)
        }
    }

    async remove({taskId, username}) {
        const task = await this.#finishedTask({taskId, username}, 'removed')
        await this.#repository.remove(task)
    }

    removeFinished(username) {
        return this.#repository.removeFinishedUserTasks(username)
    }

    async resubmit({taskId, username}) {
        const task = await this.#finishedTask({taskId, username}, 'resubmitted')
        await this.#repository.remove(task)
        return this.submit({username, operation: task.operation, params: task.params, recipeId: task.recipeId})
    }

    async reportProgress({taskId, callerTaskId, statusDescription}) {
        if (callerTaskId !== taskId) {
            throw new Unauthorized(`Progress for task ${taskId} sent with the key of task ${callerTaskId}`)
        }
        const task = await this.#repository.getTask(taskId)
        if (!task) {
            throw new NotFound(`No such task: ${taskId}`)
        }
        await this.#repository.recordProgress(task, statusDescriptionOf(statusDescription))
    }

    async authenticateApiKey(apiKey) {
        const task = await this.#repository.findByApiKeyHash(hashApiKey(apiKey))
        return task ? {username: task.username, taskId: task.id} : null
    }

    async #finishedTask({taskId, username}, action) {
        const task = await this.getTask({taskId, username})
        if (!isFinished(task)) {
            throw new InvalidCommand(`Only canceled, failed and completed tasks can be ${action}`)
        }
        return task
    }
}
