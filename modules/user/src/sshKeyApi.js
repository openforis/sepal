import {getLogger} from '#sepal/log'

import {authorizedKeysLine, keyName, parsePublicKey} from './sshKeys.js'
import {isText} from './validation.js'

const log = getLogger('sshKeyApi')

const MAX_KEYS = 20

export class SshKeyApi {
    #users
    #sshKeys
    #notifyKeyAdded

    constructor({userRepository, sshKeyRepository, notifyKeyAdded}) {
        this.#users = userRepository
        this.#sshKeys = sshKeyRepository
        this.#notifyKeyAdded = notifyKeyAdded
    }

    async list(ctx) {
        const keys = await this.#sshKeys.list(currentUsername(ctx))
        ctx.body = keys.map(toView)
    }

    async add(ctx) {
        const username = currentUsername(ctx)
        const {name, publicKey} = readBody(ctx)
        const parsed = parsePublicKey(publicKey)
        if (parsed.error) {
            return reject(ctx, parsed.error)
        }
        // A count, not an invariant: concurrent adds may pass it together, which only bounds abuse less tightly.
        if (await this.#sshKeys.count(username) >= MAX_KEYS) {
            return reject(ctx, 'TOO_MANY_KEYS')
        }
        const key = await this.#sshKeys.add(username, {
            name: keyName({name, comment: parsed.comment, type: parsed.type}),
            type: parsed.type,
            publicKey: parsed.publicKey,
            fingerprint: parsed.fingerprint
        })
        if (!key) {
            return reject(ctx, 'DUPLICATE_KEY')
        }
        await this.#notify(username, key)
        ctx.status = 201
        ctx.body = toView(key)
    }

    async remove(ctx) {
        const {id} = ctx.params
        const removed = /^\d+$/.test(id) && await this.#sshKeys.remove(currentUsername(ctx), Number(id))
        if (removed) {
            ctx.status = 204
        } else {
            ctx.status = 404
            ctx.body = {message: 'SSH key not found'}
        }
    }

    // Backs the ssh-gateway's AuthorizedKeysCommand. An inactive or unknown user gets an empty body, never
    // an error. User keys are rebuilt from their stored type and blob, so nothing a user typed reaches sshd.
    async authorizedKeys(ctx) {
        const username = ctx.query.username
        const user = isText(username) ? await this.#users.findByUsername(username) : null
        const active = user?.status === 'ACTIVE'
        const keys = active ? await this.#sshKeys.list(user.username) : []
        const lines = active ? [user.sshPublicKey?.trim(), ...keys.map(authorizedKeysLine)].filter(Boolean) : []
        ctx.type = 'text/plain'
        ctx.body = lines.map(line => `${line}\n`).join('')
    }

    // The key is stored and the user added it, so a notice that cannot be sent does not undo the add.
    async #notify(username, key) {
        try {
            const user = await this.#users.findByUsername(username)
            this.#notifyKeyAdded(user, key)
        } catch (error) {
            log.warn(`SSH key notice for '${username}' failed: ${error.message}`)
        }
    }
}

const currentUsername = ctx => ctx.state.currentUser.username

const readBody = ctx => ctx.request.body || {}

const reject = (ctx, code) => {
    ctx.status = 400
    ctx.body = {code}
}

const toView = ({id, name, type, fingerprint, creationTime}) => ({id, name, type, fingerprint, creationTime})
