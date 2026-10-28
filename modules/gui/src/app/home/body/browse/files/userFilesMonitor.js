import api from '~/apiRegistry'
import {getLogger} from '~/log'

const log = getLogger('browse')

// Keeps the user-files module watching a set of folders over the websocket, re-establishing it
// whenever the module becomes ready again, and reports the listings of watched folders.
export class UserFilesMonitor {
    #userFiles = null
    #ready = false
    #paths = []

    subscribe(onUpdate) {
        this.#userFiles = api.userFiles.ws()
        return this.#userFiles.downstream$.subscribe({
            next: ({ready, data}) => {
                ready !== undefined && this.#onReady(ready)
                data !== undefined && this.#onData(data, onUpdate)
            },
            error: error => log.error('downstream$ error', error)
        })
    }

    watch(paths) {
        const unmonitor = this.#paths.filter(path => !paths.includes(path))
        // Unmonitoring a folder also stops the server watching everything below it.
        const monitor = paths.filter(path =>
            !this.#paths.includes(path) || unmonitor.some(removed => isBelow(path, removed))
        )
        this.#paths = paths
        unmonitor.length && this.#send({unmonitor})
        monitor.length && this.#send({monitor})
    }

    remove(paths) {
        this.#send({remove: paths})
    }

    #onReady(ready) {
        this.#ready = ready
        this.#send({monitor: this.#paths, reset: true})
    }

    #onData({path, items}, onUpdate) {
        if (items && this.#paths.includes(path)) {
            onUpdate({path, items})
        }
    }

    #send(message) {
        this.#ready && this.#userFiles.upstream$.next(message)
    }
}

const isBelow = (path, folder) =>
    folder !== '' && path.startsWith(`${folder}/`)
