import {LABELS} from './containerSpec.js'

const NOT_FOUND = 404
const NOT_MODIFIED = 304
const CONFLICT = 409

export class DockerEngine {
    #docker

    constructor(docker) {
        this.#docker = docker
    }

    async run({name, ...options}) {
        const container = await this.#docker.createContainer({name, ...options})
        await container.start()
    }

    async list() {
        const containers = await this.#docker.listContainers({all: true, filters: {label: [`${LABELS.MANAGED}=true`]}})
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
        return ignoring([NOT_FOUND, CONFLICT], () => this.#docker.getContainer(name).kill())
    }

    remove(name) {
        return ignoring([NOT_FOUND, CONFLICT], () => this.#docker.getContainer(name).remove({force: true}))
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
