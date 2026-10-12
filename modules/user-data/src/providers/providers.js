import {ServerException} from '#sepal/exception'

// A provider implements, for the attachments naming it:
//   grantAccess(attachment, {mode, purpose, credentialsUrl, authorizationTokenFile}) → {rclone: {type, root, options}, env}
//   credentials(attachment, {mode}) → the provider's client credentials format
export class Providers {
    #byName

    constructor(byName) {
        this.#byName = byName
    }

    for(attachment) {
        const provider = this.#byName[attachment.provider]
        if (!provider) {
            throw new ServerException(`No provider ${attachment.provider} for attachment ${attachment.id}`)
        }
        return provider
    }
}
