import {ServerException} from '#sepal/exception'

// A provider implements, for the attachments naming it:
//   grantAccess(attachment, {mode, purpose, credentialsUrl, authorizationTokenFile}) → {rclone: {type, root, options}, env}
//   credentials(attachment, {mode}) → the provider's client credentials format
//   measureUsage(attachment) → bytes stored for the attachment
//   owners() → [username] of the users that have stored anything with this provider
//   erase(attachment) → removes everything stored for the attachment
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
