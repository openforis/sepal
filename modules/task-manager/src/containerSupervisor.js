import {getLogger} from '#sepal/log'
import {tag} from '#sepal/tag'

import {generateApiKey, hashApiKey} from './apiKey.js'
import {containerName} from './containerSpec.js'
import {isLocalWork, LOCAL_OPERATIONS} from './operations.js'
import {RUNNING_STATES, State, statusDescriptionOf} from './task.js'

const log = getLogger('supervisor')

const TICK_MS = 60 * 1000

const INTERRUPTED = statusDescriptionOf({
    messageKey: 'tasks.status.interrupted',
    defaultMessage: 'Interrupted by a server restart. Run the task again.'
})
const STALLED = statusDescriptionOf({
    messageKey: 'tasks.status.stalled',
    defaultMessage: 'The task stopped responding. Run the task again.'
})
const LAUNCH_FAILED = statusDescriptionOf({
    messageKey: 'tasks.status.launchFailed',
    defaultMessage: 'The task could not be started. Run the task again.'
})
const EXITED_UNEXPECTEDLY = statusDescriptionOf({
    messageKey: 'tasks.status.exitedUnexpectedly',
    defaultMessage: 'The task ended unexpectedly. Run the task again.'
})

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

    // Oldest first, except that local work waits for a local slot without holding up anything else.
    async #dispatchPending() {
        let free = this.#config.maxConcurrent - await this.#repository.countRunning()
        let freeLocal = this.#config.maxConcurrentLocal - await this.#repository.countRunning({operations: LOCAL_OPERATIONS})
        while (free > 0) {
            const [task] = await this.#repository.pendingTasks(1, {excludeOperations: freeLocal > 0 ? [] : LOCAL_OPERATIONS})
            if (!task) {
                return
            }
            await this.#launch(task)
            free--
            if (isLocalWork(task.operation)) {
                freeLocal--
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
            await this.#repository.transition(task, {from: RUNNING_STATES, to: State.FAILED, statusDescription: LAUNCH_FAILED})
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

    // The runner reports CANCELED on any SIGTERM; only a stop the user asked for makes that a cancel. Anything
    // else (a host reboot, an operator stopping the container) interrupted the task.
    #outcome(task, result) {
        if (result?.state === State.CANCELED) {
            return this.#interrupted(task)
        }
        if (result) {
            return {state: result.state, statusDescription: statusDescriptionOf(result.statusDescription)}
        }
        return task.state === State.CANCELING
            ? {state: State.CANCELED, statusDescription: undefined}
            : {state: State.FAILED, statusDescription: EXITED_UNEXPECTEDLY}
    }

    async #reconcile() {
        const containers = await this.#taskContainers()
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

    async #taskContainers() {
        const containers = new Map()
        for (const container of await this.#docker.list()) {
            if (container.taskId) {
                containers.set(container.taskId, container)
            } else {
                log.warn(`Removing container ${container.name}: no task id label`)
                await this.#docker.remove(container.name)
            }
        }
        return containers
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
