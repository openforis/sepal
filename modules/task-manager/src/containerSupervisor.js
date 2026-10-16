import {formatDuration, intervalToDuration} from 'date-fns'

import {getLogger} from '#sepal/log'
import {tag} from '#sepal/tag'

import {generateApiKey, hashApiKey} from './apiKey.js'
import {containerName} from './containerSpec.js'
import {LocalProcessingSlots} from './localProcessingSlots.js'
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
    #slots = new LocalProcessingSlots()

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

    requestSlot(task) {
        return this.#enqueueAnswering('slot request', () => this.#requestSlot(task))
    }

    releaseSlot(task, slot) {
        return this.#enqueueAnswering('slot release', () => this.#releaseSlot(task, slot))
    }

    // The container cancels its own work on SIGTERM and exits; collecting it ends the task. Waiting for queued
    // work lets a launch in progress create the container first. Docker's stop settles only once the container
    // has exited, up to the grace period later, so it is issued, not awaited.
    async stopContainer(task) {
        await this.#queue
        this.#docker.stop(containerName(task), this.#config.stopGraceSeconds)
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

    // A container retries a slot request or release that failed, so the failure reaches it; the queue goes on.
    #enqueueAnswering(name, work) {
        const answer = this.#queue.then(work)
        this.#queue = answer.catch(error => log.error(`Supervisor ${name} failed`, error))
        return answer
    }

    // Oldest first, except that a user at the per-user limit waits for one of their own tasks to finish, without
    // holding up anything else.
    async #dispatchPending() {
        let free = this.#config.maxConcurrent - await this.#repository.countRunning()
        const runningByUser = await this.#repository.countRunningByUser()
        while (free > 0) {
            const [task] = await this.#repository.pendingTasks(1, {excludeUsernames: this.#usersAtLimit(runningByUser)})
            if (!task) {
                return
            }
            if (!await this.#launch(task)) {
                continue
            }
            free--
            runningByUser.set(task.username, (runningByUser.get(task.username) ?? 0) + 1)
        }
    }

    #usersAtLimit(runningByUser) {
        return [...runningByUser]
            .filter(([_username, count]) => count >= this.#config.maxConcurrentPerUser)
            .map(([username]) => username)
    }

    // A task already holding a slot is granted it again, so a container that lost the answer keeps it, under a new
    // grant that a late release of the old one cannot clear.
    async #requestSlot(task) {
        const holders = await this.#repository.slotHolders()
        log.debug(() => `${taskTag(task)} local processing slot requested, ${holders.length}/${this.#config.maxConcurrentLocalProcessing} in use`)
        if (holders.some(({id}) => id === task.id)) {
            return this.#repository.renewSlot(task)
        }
        const current = await this.#repository.getTask(task.id)
        if (current?.state !== State.ACTIVE) {
            return null
        }
        const alreadyWaiting = this.#slots.isWaiting(current.id)
        const inTurn = this.#slots.request({
            task: current,
            free: this.#config.maxConcurrentLocalProcessing - holders.length,
            heldByUser: countByUser(holders),
            now: this.#config.clock().getTime()
        })
        if (!inTurn) {
            alreadyWaiting || log.info(`${taskTag(current)} waiting for a local processing slot`)
            return null
        }
        const slot = await this.#repository.grantSlot(current)
        slot && log.info(`${taskTag(current)} local processing slot granted, ${holders.length + 1}/${this.#config.maxConcurrentLocalProcessing} in use`)
        return slot
    }

    // A release names its grant, so a late one cannot clear a newer grant; a container's own releases may arrive
    // while it waits for its next slot, so they leave its place in line.
    async #releaseSlot(task, slot) {
        const grant = await this.#repository.releaseSlot(task, slot)
        if (grant) {
            const inUse = (await this.#repository.slotHolders()).length
            const used = humanDuration(grant, this.#config.clock())
            log.info(`${taskTag(task)} local processing slot released after ${used}, ${inUse}/${this.#config.maxConcurrentLocalProcessing} in use`)
        }
    }

    async #launch(task) {
        const apiKey = generateApiKey()
        if (!await this.#repository.activate(task, hashApiKey(apiKey))) {
            return false
        }
        try {
            await this.#workspace.prepare(task)
            await this.#docker.run(this.#spec({task, apiKey}))
        } catch (error) {
            log.error(`${taskTag(task)} could not be started`, error)
            await this.#repository.transition(task, {from: RUNNING_STATES, to: State.FAILED, statusDescription: LAUNCH_FAILED})
            await this.#discard(task)
            return false
        }
        log.info(`${taskTag(task)} started`)
        this.#watch(task)
        return true
    }

    #watch(task) {
        if (this.#watched.has(task.id)) {
            return
        }
        this.#watched.add(task.id)
        this.#docker.wait(containerName(task)).then(
            () => this.#enqueue('collect', () => this.#collect(task)),
            // Waiting ends when the daemon restarts too; the next reconcile picks the container up again.
            error => log.warn(`${taskTag(task)} wait interrupted`, error)
        ).finally(() => this.#watched.delete(task.id))
    }

    async #collect(task) {
        const current = await this.#repository.getTask(task.id)
        if (current && RUNNING_STATES.includes(current.state)) {
            const {state, statusDescription} = this.#outcome(current, await this.#workspace.readResult(task.id))
            await this.#repository.transition(current, {from: RUNNING_STATES, to: state, statusDescription})
            log.info(`${taskTag(current)} ${state.toLowerCase()}`)
        }
        await this.#discard(task)
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
                await this.#forgetSlot(task)
            } else if (container.running) {
                this.#watch(task)
            } else {
                await this.#collect(task)
            }
        }
        const runningIds = new Set(running.map(({id}) => id))
        for (const container of containers.values()) {
            if (!runningIds.has(container.taskId)) {
                log.warn(`Removing container ${container.name}: no running task`)
                await this.#docker.remove(container.name)
                await this.#workspace.remove(container.taskId)
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
            await this.#kill(task)
        }
        for (const task of await this.#repository.cancelingSince(new Date(now - this.#config.cancelTimeoutMs))) {
            await this.#repository.transition(task, {from: [State.CANCELING], to: State.CANCELED})
            await this.#kill(task)
        }
    }

    async #kill(task) {
        await this.#docker.kill(containerName(task))
        await this.#discard(task)
    }

    async #discard(task) {
        await this.#docker.remove(containerName(task))
        await this.#workspace.remove(task.id)
        await this.#forgetSlot(task)
    }

    // A task that ended still holds its slot until its container is gone, so every slot is released, and logged, here.
    async #forgetSlot(task) {
        this.#slots.remove(task.id)
        await this.#releaseSlot(task)
    }
}

const taskTag = task => tag('Task', task.id, task.username)

const humanDuration = (start, end) =>
    formatDuration(intervalToDuration({start, end})) || 'less than a second'

const countByUser = holders => {
    const counts = new Map()
    for (const {username} of holders) {
        counts.set(username, (counts.get(username) ?? 0) + 1)
    }
    return counts
}
