const assert = require('sepal/assert')
const {v4: uuid} = require('uuid')
const channel = require('./channel')
const {channelTag, channelListenerTag, transportTag} = require('./tag')
const _ = require('lodash')
const log = require('sepal/log').getLogger('transport')

const FORWARD = 'forward'
const REVERSE = 'reverse'

const Transport = ({transportId, messageOut, onChannel}) => {
    assert(transportId, _.isString, 'transportId must be a unique string', true)
    assert(messageOut, _.isFunction, 'messageOut must be a function', true)
    assert(onChannel, arg => !_.isNil(arg), 'onChannel must be defined', true)

    const msg = msg => [
        transportTag(transportId),
        msg
    ].join(' ')

    const state = {
        channelListeners: {}
    }

    const addChannelListener = ({key, listener, conversationId, direction}) => {
        if (state.channelListeners[key]) {
            log.warn(`${channelTag({transportId, conversationId, direction})} cannot add duplicate ${channelListenerTag(key)}`)
        } else {
            state.channelListeners = {...state.channelListeners, [key]: listener}
            log.debug(`${channelTag({transportId, conversationId, direction})} added ${channelListenerTag(key)} (${_.keys(state.channelListeners).length} active)`)
        }
    }

    const removeChannelListener = ({key, conversationId, direction}) => {
        if (state.channelListeners[key]) {
            state.channelListeners = _.omit(state.channelListeners, key)
            log.debug(`${channelTag({transportId, conversationId, direction})} removed ${channelListenerTag(key)} (${_.keys(state.channelListeners).length} active)`)
        } else {
            log.warn(`${channelTag({transportId, conversationId, direction})} cannot remove non-existing ${channelListenerTag(key)}`)
        }
    }

    const createChannel = ({conversationId, direction, in$, out$}) => {
        log.debug(`creating ${channelTag({transportId, conversationId, direction})}`)

        const handleReceivedMessage = handler =>
            ({transportId: currentTransportId, conversationId: currentConversationId, message}) => {
                if (_.isEqual(currentTransportId, transportId) && _.isEqual(currentConversationId, conversationId)) {
                    log.isTrace()
                        ? log.trace(`Received message from ${channelTag({transportId, conversationId})}:`, message)
                        : log.debug(`Received message from ${channelTag({transportId, conversationId})}: <omitted>`)
                    handler(message)
                }
            }

        const channelPort = {
            sendMessage: (end, message) => {
                log.isTrace()
                    ? log.trace(`Sending message to ${channelTag({transportId, conversationId})}:`, message)
                    : log.debug(`Sending message to ${channelTag({transportId, conversationId})}: <omitted>`)
                messageOut({transportId, conversationId, end, message})
            },
            addMessageHandler: messageHandler => {
                const key = uuid()
                const listener = handleReceivedMessage(messageHandler)
                addChannelListener({key, listener, conversationId, direction})
                return () => removeChannelListener({key, conversationId, direction})
            }
        }

        return channel({channelPort, transportId, conversationId, direction, in$, out$})
    }

    const handleCreateChannel = ({transportId: currentTranportId, conversationId}, onChannel) => {

        const byCallback = ({conversationId, onChannel}) =>
            onChannel(
                createChannel({conversationId, direction: REVERSE})
            )
    
        const byCallbackMap = ({conversationId, handler}) =>
            handler(
                createChannel({conversationId, direction: REVERSE})
            )

        const byStreams = ({conversationId, in$, out$}) =>
            createChannel({conversationId, direction: REVERSE, in$, out$})

        if (_.isEqual(currentTranportId, transportId) && conversationId && onChannel) {
            if (_.isFunction(onChannel)) {
                byCallback({conversationId, onChannel})
            } else {
                const handler = onChannel[conversationId]
                if (_.isFunction(handler)) {
                    byCallbackMap({conversationId, handler})
                } else if (_.isPlainObject(handler)) {
                    const {in$, out$} = handler
                    byStreams({conversationId, in$, out$})
                } else {
                    log.warn(`Undefined handler for ${channelTag({conversationId})}`)
                }
            }
        }
    }
        
    return {
        createChannel: (conversationId = uuid()) => {
            messageOut({createChannel: {transportId, conversationId}})
            return createChannel({transportId, conversationId, direction: FORWARD})
        },
        messageIn: message => {
            if (message.createChannel && onChannel) {
                handleCreateChannel(message.createChannel, onChannel)
            } else {
                _.forEach(state.channelListeners, channelListener => {
                    if (_.isFunction(channelListener)) {
                        channelListener(message)
                    } else {
                        log.warn(() => msg('ignored non-function listener'), channelListener)
                    }
                })
            }
        }
    }
}

module.exports = {Transport}
