import {NotFoundException} from '#sepal/exception'

export const DATA_ATTACHMENT_ID = 'data'

const DATA_PROVIDER = 's3'

// Data is the built-in attachment. Attachments users add later get the same shape, from storage.
export class Attachments {
    #bucket

    constructor({bucket}) {
        this.#bucket = bucket
    }

    list(username) {
        return [this.#data(username)]
    }

    get(username, id) {
        const attachment = this.list(username).find(attachment => attachment.id === id)
        if (!attachment) {
            throw new NotFoundException(`No attachment ${id} for user ${username}`)
        }
        return attachment
    }

    dataProvider() {
        return DATA_PROVIDER
    }

    #data(username) {
        return {
            id: DATA_ATTACHMENT_ID,
            name: 'Data',
            owner: username,
            provider: DATA_PROVIDER,
            location: {bucket: this.#bucket, prefix: `users/${username}/`},
            mountPath: 'data',
            quota: true
        }
    }
}
