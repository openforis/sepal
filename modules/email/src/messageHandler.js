const _ = require('lodash')
const log = require('#sepal/log').getLogger('messageHandler')
const {enqueue} = require('./emailQueue')
const {setEmailNotificationsEnabled} = require('./cache')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'email.send': async (key, msg) => {
        const {from, to, cc, bcc, subject, content, contentType} = msg
        if ((to || cc || bcc) && (subject || content)) {
            await enqueue({from, to, cc, bcc, subject, content, contentType})
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
