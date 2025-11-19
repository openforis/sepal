const _ = require('lodash')
const log = require('#sepal/log').getLogger('messageHandler')
const {enqueue} = require('./emailQueue')
const {setEmailNotificationsEnabled} = require('./cache')
const {getUser} = require('./http')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'email.sendToAddress': async (key, msg) => {
        const {from, to, cc, bcc, subject, content, contentType} = msg
        if ((to || cc || bcc) && (subject || content)) {
            await enqueue({from, to, cc, bcc, subject, content, contentType})
        } else {
            logError(key, msg)
        }
    },
    'email.sendToUser': async (key, msg) => {
        const {from, username, subject, content, contentType} = msg
        if (username && (subject || content)) {
            try {
                const {email, status} = await getUser(username)
                if (email) {
                    if (status === 'LOCKED') {
                        log.info(`Skipping email to locked user ${username}`)
                    } else {
                        await enqueue({from, to: email, subject, content, contentType, forceEmailNotificationEnabled: true})
                    }
                } else {
                    log.error(`Cannot send email to user ${username} - no email address found`)
                }
            } catch (error) {
                log.error(`Cannot send email to user ${username} - error feztching user info:`, error)
            }
        } else {
            logError(key, msg)
        }
    },
    'user.emailNotificationsEnabled': async (key, msg) => {
        const {username, enabled} = msg
        if (username) {
            await setEmailNotificationsEnabled(username, enabled)
        } else {
            logError(key, msg)
        }
    }
}

const messageHandler = async (key, msg) => {
    const handler = handlers[key]
    return handler && await handler(key, msg)
}

module.exports = {messageHandler}
