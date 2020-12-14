const {v4: uuid} = require('uuid')
const channel = require('./channel')
const {channelTag, channelListenerTag, transportTag} = require('./tag')
const _ = require('lodash')
const log = require('sepal/log').getLogger('transport')

const FORWARD = 'forward'
const REVERSE = 'reverse'

const transport = ({id = {id: uuid()}, port}) => {

    const msg = msg => [
        transportTag(id),
        msg
    ].join(' ')

    const state = {
        channelListeners: {}
    }

    port.on('message', message =>
        _.forEach(state.channelListeners, channelListener => {
            if (_.isFunction(channelListener)) {
                channelListener(message)
            } else {
                log.warn(() => msg('ignored non-function listener'), channelListener)
            }
        })
    )

    const addChannelListener = (key, listener) => {
        if (state.channelListeners[key]) {
            log.warn(() => msg(`cannot add duplicate ${channelListenerTag(key)}`))
        } else {
            state.channelListeners = {...state.channelListeners, [key]: listener}
            log.debug(() => msg(`added ${channelListenerTag(key)}, now ${_.keys(state.channelListeners).length}`))
        }
    }

    const removeChannelListener = key => {
        if (state.channelListeners[key]) {
            state.channelListeners = _.omit(state.channelListeners, key)
            log.debug(msg(`removed ${channelListenerTag(key)}, now ${_.keys(state.channelListeners).length}`))
        } else {
            log.warn(msg(`cannot remove non-existing ${channelListenerTag(key)}`))
        }
    }

    const createChannel = ({channelId, conversationId, direction, in$, out$}) => {
        log.debug(msg(`creating ${channelTag(channelId, conversationId, direction)}`))

        const handleReceivedMessage = handler =>
            ({channelId: messageChannelId, conversationId: messageConversationId, message}) => {
                if (_.isEqual(messageChannelId, channelId) && _.isEqual(messageConversationId, conversationId)) {
                    log.isTrace()
                        ? log.trace(() => msg(`received message from ${channelTag(channelId, conversationId)}:`), message)
                        : log.debug(() => msg(`received message from ${channelTag(channelId, conversationId)}: <omitted>`))
                    handler(message)
                }
            }

        const channelPort = {
            sendMessage: (end, message) => {
                log.isTrace()
                    ? log.trace(() => msg(`sending message to ${channelTag(channelId, conversationId)}:`), message)
                    : log.debug(() => msg(`sending message to ${channelTag(channelId, conversationId)}: <omitted>`))
                port.postMessage({channelId, conversationId, end, message})
            },
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
                    log.warn(`Undefined handler for ${channelTag(channelId)}`)
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
