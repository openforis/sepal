import {ServerException} from '#sepal/exception'

// A provider implements, for the attachments naming it:
//   grantAccess(attachment, {mode, purpose, credentialsUrl, authorizationTokenFile}) → {rclone: {type, root, options}, env}
//   credentials(attachment, {mode}) → the provider's client credentials format
//   measureUsage(attachment) → bytes stored for the attachment
//   owners() → [username] of the users that have stored anything with this provider
//   erase(attachment, {before}) → removes everything stored for the attachment, or with `before` only what was last
//     modified before then
//   isEmulator() → whether presigned URLs are unavailable (dev-env), so downloads must be streamed
//   list(attachment, relPath) → [{name, dir: true} | {name, file: true, size, mtime}] directly below relPath
//     ('' is the root)
//   downloadUrl(attachment, relPath, {expiresSeconds}) → a presigned URL that downloads the file
//   download(attachment, relPath) → {stream, size, contentType} of the file
//   remove(attachment, relPath) → deletes the file at relPath, or the folder and everything under it
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
