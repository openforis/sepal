import {defer, firstValueFrom, from} from 'rxjs'

import {disableLibraryCredentials} from '#sepal/ee/transport/libraryTransport'

// Earth Engine for a thread serving many users at once: the client library, initialized once as the service
// account, only builds requests, and the installed transport sends them.
export class EERestRuntime {
    #ee
    #serviceAccountToken$
    #projectId
    #createTransport
    #ready = null

    constructor({ee, serviceAccountToken$, projectId, createTransport}) {
        this.#ee = ee
        this.#serviceAccountToken$ = serviceAccountToken$
        this.#projectId = projectId
        this.#createTransport = createTransport
    }

    // Shared as a Promise, not an Observable: each waiting request resumes in its own async context, not in
    // the one of the request that started the initialization.
    ready$() {
        return defer(() => from(this.#ready ??= this.#initialize().catch(error => {
            this.#ready = null
            throw error
        })))
    }

    async #initialize() {
        const {accessToken} = await firstValueFrom(this.#serviceAccountToken$())
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
        this.#ee.setTransport(this.#createTransport())
        disableLibraryCredentials(this.#ee)
    }
}
