const {v4: uuid} = require('uuid')
const channel = require('./channel')
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
            onChannel(
                createChannel(channelId, 'reverse')
            )
        }
    }
    
    port.on('message', outMessage)

    return transportInstance
}

module.exports = transport
