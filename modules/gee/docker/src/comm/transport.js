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

    const createChannel = (channelId, direction) => {
        log.trace(msg('create channel:'), channelId)
        return channel({
            transport: transportInstance,
            channelId,
            direction
        })
    }
        
    const transportInstance = {
        id,
        port,
        createChannel: channelId => {
            send({createChannel: channelId})
            return createChannel(channelId, 'direct')
        }
    }
    
    const outMessage = message => {
        const channelId = message.createChannel
        if (channelId && onChannel) {
            if (_.isFunction(onChannel)) {
                onChannel(
                    createChannel(channelId, 'reverse')
                )
            } else {
                const handler = onChannel[channelId]
                if (handler) {
                    handler(
                        createChannel(channelId, 'reverse')
                    )
                } else {
                    log.warn('Undefined handler for channel:', channelId)
                }
            }
        }
    }
    
    port.on('message', outMessage)

    return transportInstance
}

module.exports = transport
