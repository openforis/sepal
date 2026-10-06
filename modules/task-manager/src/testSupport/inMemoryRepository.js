import {RUNNING_STATES, State, StateDescription} from '../task.js'

export class InMemoryRepository {
    #tasks = new Map()
    #clock

    constructor(clock) {
        this.#clock = clock
    }

    async add(task) {
        const stored = {...task, progressTime: task.state === State.ACTIVE ? this.#clock.now() : null, updateTime: this.#clock.now()}
        this.#tasks.set(task.id, stored)
        return stored
    }

    async getTask(id) {
        return this.#tasks.get(id) ?? null
    }

    async pendingTasks(limit, {excludeOperations = []} = {}) {
        return [...this.#tasks.values()]
            .filter(({state, operation}) => state === State.PENDING && !excludeOperations.includes(operation))
            .sort((a, b) => a.creationTime - b.creationTime)
            .slice(0, limit)
    }

    async runningTasks() {
        return [...this.#tasks.values()].filter(({state}) => RUNNING_STATES.includes(state))
    }

    async countRunning({operations} = {}) {
        return (await this.runningTasks()).filter(task => !operations || operations.includes(task.operation)).length
    }

    async activate(task, apiKeyHash) {
        return this.#update(task.id, [State.PENDING], {state: State.ACTIVE, apiKeyHash, progressTime: this.#clock.now()})
    }

    async transition(task, {from, to, statusDescription = StateDescription[to]}) {
        return this.#update(task.id, from, {state: to, statusDescription})
    }

    async stalledTasks(before) {
        return [...this.#tasks.values()].filter(({state, progressTime}) => state === State.ACTIVE && progressTime < before)
    }

    async cancelingSince(before) {
        return [...this.#tasks.values()].filter(({state, updateTime}) => state === State.CANCELING && updateTime < before)
    }

    async insert(task) {
        this.#tasks.set(task.id, {...task, removed: false})
    }

    async userTasks(username) {
        return [...this.#tasks.values()]
            .filter(task => task.username === username && !task.removed)
            .sort((a, b) => a.creationTime - b.creationTime)
    }

    async recordProgress(task, statusDescription) {
        return this.#update(task.id, [State.ACTIVE], {statusDescription, progressTime: this.#clock.now()})
    }

    async resetProgressClock() {
        for (const task of this.#tasks.values()) {
            if (task.state === State.ACTIVE) {
                this.#tasks.set(task.id, {...task, progressTime: this.#clock.now()})
            } else if (task.state === State.CANCELING) {
                this.#tasks.set(task.id, {...task, updateTime: this.#clock.now()})
            }
        }
    }

    async findByApiKeyHash(apiKeyHash) {
        return [...this.#tasks.values()].find(task => task.apiKeyHash === apiKeyHash && RUNNING_STATES.includes(task.state)) ?? null
    }

    async remove(task) {
        this.#tasks.set(task.id, {...this.#tasks.get(task.id), removed: true})
        return true
    }

    async removeFinishedUserTasks(username) {
        for (const task of this.#tasks.values()) {
            if (task.username === username && [State.COMPLETED, State.CANCELED, State.FAILED].includes(task.state)) {
                this.#tasks.set(task.id, {...task, removed: true})
            }
        }
    }

    #update(id, from, changes) {
        const task = this.#tasks.get(id)
        if (!task || !from.includes(task.state)) {
            return false
        }
        this.#tasks.set(id, {...task, ...changes, updateTime: this.#clock.now()})
        return true
    }
}
