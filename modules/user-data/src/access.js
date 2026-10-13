import {ClientException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

const log = getLogger('access')

export const PURPOSES = ['sandbox', 'mount', 'task']

// Where sandboxes and mount sidecars keep the "Basic <base64(:api key)>" header the credentials endpoint expects.
export const AUTHORIZATION_TOKEN_FILE = '/var/run/sepal-data-token'

export class Access {
    #attachments
    #providers
    #quotaState
    #usage
    #sepalHost

    constructor({attachments, providers, quotaState, usage, sepalHost}) {
        this.#attachments = attachments
        this.#providers = providers
        this.#quotaState = quotaState
        this.#usage = usage
        this.#sepalHost = sepalHost
    }

    list(username) {
        return this.#attachments.list(username)
            .map(({id, name, mountPath, quota}) => ({id, name, mountPath, quota}))
    }

    async grant(username, attachmentId, purpose) {
        if (!PURPOSES.includes(purpose)) {
            throw new ClientException(`Not an access purpose: ${purpose}`)
        }
        const attachment = this.#attachments.get(username, attachmentId)
        const mode = await this.#modeFor(username)
        const granted = await this.#providers.for(attachment).grantAccess(attachment, {
            mode,
            purpose,
            credentialsUrl: this.#credentialsUrl(attachment),
            authorizationTokenFile: AUTHORIZATION_TOKEN_FILE
        })
        return {attachment: attachment.id, mode, ...granted}
    }

    async credentials(username, attachmentId) {
        const attachment = this.#attachments.get(username, attachmentId)
        const mode = await this.#modeFor(username)
        return this.#providers.for(attachment).credentials(attachment, {mode})
    }

    async #modeFor(username) {
        const mode = this.#quotaState.mode(username)
        if (mode === 'readWrite') {
            await this.#markDirty(username)
        }
        return mode
    }

    // Measuring is bookkeeping: a failure to mark must not cost the user access to their Data.
    async #markDirty(username) {
        try {
            await this.#usage.markDirty(username)
        } catch (error) {
            log.warn(`Cannot mark the Data of ${username} for measuring`, error)
        }
    }

    #credentialsUrl({id}) {
        return `https://${this.#sepalHost}/api/user-data/attachments/${id}/credentials`
    }
}
