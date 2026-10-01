import {defer, firstValueFrom, from} from 'rxjs'

import {disableLibraryCredentials} from '#sepal/ee/transport/libraryTransport'

const DEFAULT_INITIALIZATION_TIMEOUT_MS = 60 * 1000

// Earth Engine for a thread serving many users at once: the client library, initialized once as the service
// account, only builds requests, and the installed transport sends them.
export class EERestRuntime {
    #ee
    #serviceAccountToken$
    #projectId
    #createTransport
    #initializationTimeoutMs
    #ready = null

    constructor({ee, serviceAccountToken$, projectId, createTransport, initializationTimeoutMs = DEFAULT_INITIALIZATION_TIMEOUT_MS}) {
        this.#ee = ee
        this.#serviceAccountToken$ = serviceAccountToken$
        this.#projectId = projectId
        this.#createTransport = createTransport
        this.#initializationTimeoutMs = initializationTimeoutMs
    }

    // Shared as a Promise, not an Observable: each waiting request resumes in its own async context, not in
    // the one of the request that started the initialization.
    ready$() {
        return defer(() => from(this.#ready ??= this.#initializeInTime().catch(error => {
            this.#ready = null
            throw error
        })))
    }

    // ee.initialize queues behind an initialization in progress, so a hung one is abandoned with ee.reset(), or
    // the next attempt would hang behind it.
    async #initializeInTime() {
        const attempt = {abandoned: false}
        let timer
        const timedOut = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                attempt.abandoned = true
                reject(new Error(`Earth Engine initialization did not complete within ${this.#initializationTimeoutMs} ms`))
                this.#ee.reset()
            }, this.#initializationTimeoutMs)
        })
        try {
            await Promise.race([this.#initialize(attempt), timedOut])
        } finally {
            clearTimeout(timer)
        }
    }

    async #initialize(attempt) {
        const {accessToken} = await firstValueFrom(this.#serviceAccountToken$())
        if (attempt.abandoned) {
            return
        }
        this.#ee.data.setAuthToken(null, 'Bearer', accessToken, null, null, null, false)
        await new Promise((resolve, reject) =>
            this.#ee.initialize(
                null,
                null,
                resolve,
                error => reject(new Error(`Earth Engine initialization failed: ${error}`)),
                null,
                this.#projectId
            )
        )
        if (attempt.abandoned) {
            return
        }
        this.#ee.setTransport(this.#createTransport())
        disableLibraryCredentials(this.#ee)
    }
}
