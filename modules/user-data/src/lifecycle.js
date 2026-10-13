import {DATA_ATTACHMENT_ID} from './attachments.js'

export class Lifecycle {
    #attachments
    #providers
    #usage

    constructor({attachments, providers, usage}) {
        this.#attachments = attachments
        this.#providers = providers
        this.#usage = usage
    }

    async onUserStorageErased({username}) {
        const attachment = this.#attachments.get(username, DATA_ATTACHMENT_ID)
        await this.#providers.for(attachment).erase(attachment)
        await this.#usage.recordErased(username)
    }
}
