import {ClientException} from '#sepal/exception'

export const PURPOSES = ['sandbox', 'mount', 'task']

// Where sandboxes and mount sidecars keep the "Basic <base64(:api key)>" header the credentials endpoint expects.
export const AUTHORIZATION_TOKEN_FILE = '/var/run/sepal-data-token'

export class Access {
    #attachments
    #providers
    #sepalHost

    constructor({attachments, providers, sepalHost}) {
        this.#attachments = attachments
        this.#providers = providers
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
        const mode = this.#mode()
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
        return this.#providers.for(attachment).credentials(attachment, {mode: this.#mode()})
    }

    #mode() {
        return 'readWrite'
    }

    #credentialsUrl({id}) {
        return `https://${this.#sepalHost}/api/user-data/attachments/${id}/credentials`
    }
}
