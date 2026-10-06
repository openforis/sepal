import {LABELS} from './containerSpec.js'

const NOT_FOUND = 404
const NOT_MODIFIED = 304
const CONFLICT = 409
const TIMEOUT_MS = 60 * 1000

// The supervisor runs every call but wait and stop in its single queue, so those calls give up rather than let a
// hung daemon stop supervision; the next reconcile retries. A wait lasts the container's lifetime, and a stop
// is issued without being awaited.
export class DockerEngine {
    #docker
    #timeoutMs

    constructor(docker, {timeoutMs = TIMEOUT_MS} = {}) {
        this.#docker = docker
        this.#timeoutMs = timeoutMs
    }

    run({name, ...options}) {
        return this.#withTimeout(`Starting container ${name}`, async () => {
            const container = await this.#docker.createContainer({name, ...options})
            await container.start()
        })
    }

    async list() {
        const containers = await this.#withTimeout('Listing containers', () =>
            this.#docker.listContainers({all: true, filters: {label: [`${LABELS.MANAGED}=true`]}})
        )
        return containers.map(({Names: [name], Labels, State}) => ({
            name: name.replace(/^\//, ''),
            taskId: Labels[LABELS.TASK_ID],
            running: State === 'running'
        }))
    }

    wait(name) {
        return this.#docker.getContainer(name).wait()
    }

    stop(name, seconds) {
        return ignoring([NOT_FOUND, NOT_MODIFIED], () => this.#docker.getContainer(name).stop({t: seconds}))
    }

    kill(name) {
        return this.#withTimeout(`Killing container ${name}`, () =>
            ignoring([NOT_FOUND, CONFLICT], () => this.#docker.getContainer(name).kill())
        )
    }

    remove(name) {
        return this.#withTimeout(`Removing container ${name}`, () =>
            ignoring([NOT_FOUND, CONFLICT], () => this.#docker.getContainer(name).remove({force: true}))
        )
    }

    async #withTimeout(description, call) {
        let timer
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`${description} timed out after ${this.#timeoutMs} ms`)), this.#timeoutMs)
        })
        try {
            return await Promise.race([call(), timeout])
        } finally {
            clearTimeout(timer)
        }
    }
}

const ignoring = async (statusCodes, action) => {
    try {
        await action()
    } catch (error) {
        if (!statusCodes.includes(error.statusCode)) {
            throw error
        }
    }
}
