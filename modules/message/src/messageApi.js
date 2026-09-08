import {publishMessagesChanged} from './changed.js'
import {isAdmin} from './currentUser.js'
import {messageToMap, notificationToMap} from './message.js'

export class MessageApi {
    #repository

    constructor(repository) {
        this.#repository = repository
    }

    // POST /messages/:id (admin)
    async saveMessage(ctx) {
        const {subject, contents, type, priority} = readBody(ctx)
        const username = ctx.state.currentUser.username
        const saved = await this.#repository.saveMessage({
            id: ctx.params.id,
            username,
            subject,
            contents,
            type,
            priority: Number(priority) || 0
        })
        // The author has evidently read their own message — mark it READ before publishing the change,
        // so the pushed snapshots already carry the READ state.
        await this.#repository.updateNotification({username, messageId: ctx.params.id, state: 'READ'})
        publishMessagesChanged()
        ctx.status = 200
        ctx.body = messageToMap(saved)
    }

    // DELETE /messages/:id (admin)
    async removeMessage(ctx) {
        await this.#repository.removeMessage(ctx.params.id)
        publishMessagesChanged()
        ctx.status = 204
    }

    // GET /notifications (auth)
    async listNotifications(ctx) {
        const user = ctx.state.currentUser
        ctx.body = await this.userNotifications(user.username, isAdmin(user))
    }

    // POST /notifications/:id (auth)
    async updateNotification(ctx) {
        const username = ctx.state.currentUser.username
        await this.#repository.updateNotification({
            username,
            messageId: ctx.params.id,
            state: readBody(ctx).state
        })
        // Message-scoped (broadcast) rather than user-scoped: a read-state change also moves the
        // message's acknowledged count, which every subscriber displays.
        publishMessagesChanged()
        ctx.status = 204
    }

    // The current notification list of a user, REST-shaped. Shared by the GET /notifications handler
    // and the ws push layer (ws.js), so both emit the same payload. Only admins get unpublished
    // (priority < 0) messages.
    async userNotifications(username, admin = false) {
        const rows = await this.#repository.listNotifications(username, admin)
        return rows.map(notificationToMap)
    }
}

const readBody = ctx => ctx.request.body || {}
