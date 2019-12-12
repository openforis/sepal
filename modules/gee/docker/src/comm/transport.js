const {v4: uuid} = require('uuid')
const channel = require('./channel')
const _ = require('lodash')
const log = require('../log')

const transport = ({id = uuid(), port, onChannel}) => {
    const send = message =>
        port.postMessage(message)

    const msg = msg => [
        `Transport [${id}]`,
        msg
    ].join(' ')

    const createChannel = ({channelId, direction, in$, out$}) => {
        log.trace(msg('create channel:'), channelId)
        return channel({transport, channelId, direction, in$, out$})
    }
        
    const transport = {
        id,
        port,
        createChannel: channelId => {
            send({createChannel: channelId})
            return createChannel({channelId, direction: 'direct'})
        }
    }
    
    const outMessage = message => {
        const channelId = message.createChannel
        if (channelId && onChannel) {
            if (_.isFunction(onChannel)) {
                onChannel(
                    createChannel({channelId, direction: 'reverse'})
                )
            } else {
                const handler = onChannel[channelId]
                if (_.isFunction(handler)) {
                    handler(
                        createChannel({channelId, direction: 'reverse'})
                    )
                } else if (_.isPlainObject(handler)) {
                    const {in$, out$} = handler
                    createChannel({channelId, direction: 'reverse', in$, out$})
                } else {
                    log.warn('Undefined handler for channel:', channelId)
                }
            }
        }
    }
    
    port.on('message', outMessage)

    return transport
}

module.exports = transport
