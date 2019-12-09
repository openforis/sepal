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

    const createChannel = channelId => {
        log.trace(msg('create channel:'), channelId)
        return channel({
            transport: transportInstance,
            channelId
        })
    }
        
    const transportInstance = {
        id,
        port,
        createChannel: channelId => {
            send({createChannel: channelId})
            return createChannel(channelId)
        }
    }
    
    const outMessage = message => {
        const channelId = message.createChannel
        if (channelId && onChannel) {
            onChannel(
                createChannel(channelId)
            )
        }
    }
    
    port.on('message', outMessage)

    return transportInstance
}

module.exports = transport
