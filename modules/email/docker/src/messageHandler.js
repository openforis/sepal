const _ = require('lodash')
const log = require('sepal/log').getLogger('messageQueue')
const {send} = require('./email')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'email.send': async (key, msg) => {
        if (msg && msg.to) {
            await send(msg)
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
