import {getLogger} from '#sepal/log'
import {tag} from '#sepal/tag'

import {generateApiKey, hashApiKey} from './apiKey.js'
import {containerName} from './containerSpec.js'
import {failure, RUNNING_STATES, State, statusDescriptionOf} from './task.js'

const log = getLogger('supervisor')

const TICK_MS = 60 * 1000

const INTERRUPTED = statusDescriptionOf({
    messageKey: 'tasks.status.interrupted',
    defaultMessage: 'Interrupted by a server restart. Run the task again.'
})
const STALLED = failure('the task stopped responding')

// Launches, watches and collects one detached container per task. Every step that reads or changes tasks and
// containers runs through one queue, so a reconcile never sees a task between being activated and its
// container existing. Only waiting for a container to exit, and for a stop to take effect, happens outside it.
export class ContainerSupervisor {
    #repository
    #docker
    #workspace
    #spec
    #config
    #queue = Promise.resolve()
    #watched = new Set()
    #timer = null

    constructor({repository, docker, workspace, spec, config}) {
        this.#repository = repository
        this.#docker = docker
        this.#workspace = workspace
        this.#spec = spec
        this.#config = config
    }

    async start() {
        await this.#repository.resetProgressClock()
        await this.reconcile()
        await this.dispatch()
        this.#timer = setInterval(() => this.#tick(), TICK_MS)
    }

    stop() {
        clearInterval(this.#timer)
    }

    dispatch() {
        return this.#enqueue('dispatch', () => this.#dispatchPending())
    }

    reconcile() {
        return this.#enqueue('reconcile', () => this.#reconcile())
    }

    enforceTimeouts() {
        return this.#enqueue('timeouts', () => this.#enforceTimeouts())
    }

    // The container cancels its own work on SIGTERM and exits; collecting it ends the task. Waiting for queued
    // work lets a launch in progress create the container first. Docker's stop settles only once the container
    // has exited, up to the grace period later, so it is issued, not awaited.
    async stopContainer(task) {
        await this.#queue
        this.#docker.stop(containerName(task.id), this.#config.stopGraceSeconds)
            .catch(error => log.error(`${taskTag(task)} could not be stopped`, error))
    }

    // Settles once no queued work remains, including work queued meanwhile by a container that exited.
    async idle() {
        let tail
        do {
            tail = this.#queue
            await tail
            await new Promise(resolve => setImmediate(resolve))
        } while (tail !== this.#queue)
    }

    #tick() {
        this.reconcile()
        this.enforceTimeouts()
        this.dispatch()
    }

    #enqueue(name, work) {
        this.#queue = this.#queue
            .then(work)
            .catch(error => log.error(`Supervisor ${name} failed`, error))
        return this.#queue
    }

    async #dispatchPending() {
        const free = this.#config.maxConcurrent - await this.#repository.countRunning()
        if (free > 0) {
            for (const task of await this.#repository.pendingTasks(free)) {
                await this.#launch(task)
            }
        }
    }

    async #launch(task) {
        const apiKey = generateApiKey()
        if (!await this.#repository.activate(task, hashApiKey(apiKey))) {
            return
        }
        try {
            await this.#workspace.prepare(task)
            await this.#docker.run(this.#spec({task, apiKey}))
        } catch (error) {
            log.error(`${taskTag(task)} could not be launched`, error)
            await this.#repository.transition(task, {from: RUNNING_STATES, to: State.FAILED, statusDescription: failure('the task could not be started')})
            await this.#discard(task.id)
            return
        }
        log.info(`${taskTag(task)} launched`)
        this.#watch(task)
    }

    #watch(task) {
        if (this.#watched.has(task.id)) {
            return
        }
        this.#watched.add(task.id)
        this.#docker.wait(containerName(task.id)).then(
            () => this.#enqueue('collect', () => this.#collect(task.id)),
            // Waiting ends when the daemon restarts too; the next reconcile picks the container up again.
            error => log.warn(`${taskTag(task)} wait interrupted`, error)
        ).finally(() => this.#watched.delete(task.id))
    }

    async #collect(taskId) {
        const task = await this.#repository.getTask(taskId)
        if (task && RUNNING_STATES.includes(task.state)) {
            const {state, statusDescription} = this.#outcome(task, await this.#workspace.readResult(taskId))
            await this.#repository.transition(task, {from: RUNNING_STATES, to: state, statusDescription})
            log.info(`${taskTag(task)} ${state}`)
        }
        await this.#discard(taskId)
        await this.#dispatchPending()
    }

    #outcome(task, result) {
        if (result) {
            return {state: result.state, statusDescription: statusDescriptionOf(result.statusDescription)}
        }
        return task.state === State.CANCELING
            ? {state: State.CANCELED, statusDescription: undefined}
            : {state: State.FAILED, statusDescription: failure('the task ended unexpectedly')}
    }

    async #reconcile() {
        const containers = new Map((await this.#docker.list()).map(container => [container.taskId, container]))
        const running = await this.#repository.runningTasks()
        for (const task of running) {
            const container = containers.get(task.id)
            if (!container) {
                const {state, statusDescription} = this.#interrupted(task)
                await this.#repository.transition(task, {from: RUNNING_STATES, to: state, statusDescription})
                await this.#workspace.remove(task.id)
            } else if (container.running) {
                this.#watch(task)
            } else {
                await this.#collect(task.id)
            }
        }
        const runningIds = new Set(running.map(({id}) => id))
        for (const container of containers.values()) {
            if (!runningIds.has(container.taskId)) {
                log.warn(`Removing container ${container.name}: no running task`)
                await this.#discard(container.taskId)
            }
        }
    }

    #interrupted(task) {
        return task.state === State.CANCELING
            ? {state: State.CANCELED, statusDescription: undefined}
            : {state: State.FAILED, statusDescription: INTERRUPTED}
    }

    async #enforceTimeouts() {
        const now = this.#config.clock().getTime()
        for (const task of await this.#repository.stalledTasks(new Date(now - this.#config.stallTimeoutMs))) {
            await this.#repository.transition(task, {from: [State.ACTIVE], to: State.FAILED, statusDescription: STALLED})
            await this.#kill(task.id)
        }
        for (const task of await this.#repository.cancelingSince(new Date(now - this.#config.cancelTimeoutMs))) {
            await this.#repository.transition(task, {from: [State.CANCELING], to: State.CANCELED})
            await this.#kill(task.id)
        }
    }

    async #kill(taskId) {
        await this.#docker.kill(containerName(taskId))
        await this.#discard(taskId)
    }

    async #discard(taskId) {
        await this.#docker.remove(containerName(taskId))
        await this.#workspace.remove(taskId)
    }
}

const taskTag = task => tag('Task', task.id, task.username)
