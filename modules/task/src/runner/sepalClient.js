import {firstValueFrom} from 'rxjs'

import {postJson$} from '#sepal/httpClient'

const NO_RETRY = {maxRetries: 0}

// Every call goes through the gateway, authenticated with the task's own key; the gateway adds the user's
// fresh Google tokens for gee.
export class SepalClient {
    #endpoint
    #apiKey

    constructor({endpoint, apiKey}) {
        this.#endpoint = endpoint
        this.#apiKey = apiKey
    }

    gee(path, body) {
        return this.#post(`api/gee/${path}`, body)
    }

    // A start that may have reached Earth Engine is never sent again: a second export would run beside the first.
    startExport(path, body) {
        return this.#post(`api/gee/${path}`, body, NO_RETRY)
    }

    reportProgress(taskId, statusDescription) {
        return this.#post(`api/tasks/task/${taskId}/progress`, {statusDescription}, NO_RETRY)
    }

    async #post(path, body, retry) {
        try {
            const response = await firstValueFrom(postJson$(`${this.#endpoint}/${path}`, {
                body,
                username: '',
                password: this.#apiKey,
                headers: {'No-auth-challenge': 'true'},
                responseType: 'json',
                ...(retry ? {retry} : {})
            }))
            return response.body
        } catch (error) {
            // The request carries the Authorization header, and failures are logged.
            delete error.request
            throw error
        }
    }
}
