const {v4: uuid} = require('uuid')
const channel = require('./channel')
const _ = require('lodash')
const log = require('../log')('transport')

const transport = ({id = uuid(), port}) => {
    const send = message =>
        port.postMessage(message)

    const msg = msg => [
        `Transport [${id}]`,
        msg
    ].join(' ')

    const createChannel = ({channelId, conversationId, direction, in$, out$}) => {
        log.debug(msg(`create ${direction} channel:`), channelId)
        return channel({transport, channelId, conversationId, direction, in$, out$})
    }

    const handleCreateChannel = ({channelId, conversationId}, onChannel) => {
        if (channelId && onChannel) {
            if (_.isFunction(onChannel)) {
                onChannel(
                    createChannel({channelId, conversationId, direction: 'reverse'})
                )
            } else {
                const handler = onChannel[channelId]
                if (_.isFunction(handler)) {
                    handler(
                        createChannel({channelId, conversationId, direction: 'reverse'})
                    )
                } else if (_.isPlainObject(handler)) {
                    const {in$, out$} = handler
                    createChannel({channelId, conversationId, direction: 'reverse', in$, out$})
                } else {
                    log.warn('Undefined handler for channel:', channelId)
                }
            }
        }
    }
        
    const transport = {
        id,
        port,
        createChannel: (channelId, conversationId = uuid()) => {
            send({createChannel: {channelId, conversationId}})
            return createChannel({channelId, conversationId, direction: 'direct'})
        },
        onChannel: onChannel => {
            const handleMessage = message => {
                message.createChannel && handleCreateChannel(message.createChannel, onChannel)
            }
            
            port.on('message', handleMessage)
        }
    }

    return transport
}

module.exports = transport
