const _ = require('lodash')
const log = require('sepal/log').getLogger('messageHandler')
const {enqueue} = require('./emailQueue')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'email.send': async (key, msg) => {
        const {to, cc, bcc, subject, body} = msg
        if ((to || cc || bcc) && (subject || body)) {
            await enqueue({to, cc, bcc, subject, body})
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
