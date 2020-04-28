const {v4: uuid} = require('uuid')
const channel = require('./channel')
const _ = require('lodash')
const log = require('sepal/log').getLogger('transport')

const FORWARD = 'forward'
const REVERSE = 'reverse'

const transport = ({id = uuid(), port}) => {
    const msg = msg => [
        `Transport [${id}]`,
        msg
    ].join(' ')

    const channelListeners = {}

    port.on('message', message =>
        _.forEach(channelListeners, channelListener => {
            if (_.isFunction(channelListener)) {
                channelListener(message)
            } else {
                log.warn(msg('ignoring non-function listener'), channelListener)
            }
        })
    )

    const addChannelListener = (key, listener) => {
        if (channelListeners[key]) {
            log.warn(msg(`cannot add duplicate channel listener [${key}]`))
        } else {
            channelListeners[key] = listener
            log.debug(msg(`added channel listener [${key}], now ${_.keys(channelListeners).length}`))
        }
    }

    const removeChannelListener = key => {
        if (channelListeners[key]) {
            delete channelListeners[key]
            log.debug(msg(`removed channel listener [${key}], now ${_.keys(channelListeners).length}`))
        } else {
            log.warn(msg(`cannot remove non-existing channel listener [${key}]`))
        }
    }

    const createChannel = ({channelId, conversationId, direction, in$, out$}) => {
        log.debug(msg(`creating ${direction} channel:`), channelId)

        const handleReceivedMessage = handler =>
            ({channelId: messageChannelId, conversationId: messageConversationId, message}) =>
                messageChannelId === channelId && messageConversationId === conversationId && handler(message)

        const channelPort = {
            sendMessage: (end, message) => port.postMessage({channelId, conversationId, end, message}),
            addMessageHandler: (end, messageHandler) => {
                const key = uuid()
                const listener = handleReceivedMessage(messageHandler)
                addChannelListener(key, listener)
                return () => removeChannelListener(key)
            }
        }

        return channel({channelPort, channelId, conversationId, direction, in$, out$})
    }

    const handleCreateChannel = ({channelId, conversationId}, onChannel) => {
        const byCallback = ({channelId, conversationId, onChannel}) =>
            onChannel(
                createChannel({channelId, conversationId, direction: REVERSE})
            )
    
        const byCallbackMap = ({channelId, conversationId, handler}) =>
            handler(
                createChannel({channelId, conversationId, direction: REVERSE})
            )

        const byStreams = ({channelId, conversationId, in$, out$}) =>
            createChannel({channelId, conversationId, direction: REVERSE, in$, out$})

        if (channelId && onChannel) {
            if (_.isFunction(onChannel)) {
                byCallback({channelId, conversationId, onChannel})
            } else {
                const handler = onChannel[channelId]
                if (_.isFunction(handler)) {
                    byCallbackMap({channelId, conversationId, handler})
                } else if (_.isPlainObject(handler)) {
                    const {in$, out$} = handler
                    byStreams({channelId, conversationId, in$, out$})
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
            port.postMessage({createChannel: {channelId, conversationId}})
            return createChannel({channelId, conversationId, direction: FORWARD})
        },
        onChannel: onChannel => {
            const handleMessage = message => {
                message.createChannel && handleCreateChannel(message.createChannel, onChannel)
            }
            
            port.on('message', handleMessage) // [TODO] unsubscribe this?
        }
    }

    return transport
}

module.exports = transport
