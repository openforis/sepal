const assert = require('#sepal/assert')
const {v4: uuid} = require('uuid')
const {channel} = require('./transport/channel')
const {channelTag, channelListenerTag, transportTag} = require('./transport/tag')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('transport')

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

    const addChannelListener = ({key, listener, conversationGroupId, conversationId, direction}) => {
        if (state.channelListeners[key]) {
            log.warn(`${channelTag({transportId, conversationGroupId, conversationId, direction})} cannot add duplicate ${channelListenerTag(key)}`)
        } else {
            state.channelListeners = {...state.channelListeners, [key]: listener}
            log.debug(`${channelTag({transportId, conversationGroupId, conversationId, direction})} added ${channelListenerTag(key)} (${_.keys(state.channelListeners).length} active)`)
        }
    }

    const removeChannelListener = ({key, conversationGroupId, conversationId, direction}) => {
        if (state.channelListeners[key]) {
            state.channelListeners = _.omit(state.channelListeners, [key]) // NOTE: delete state.channelListeners[key] doesn't work
            log.debug(`${channelTag({transportId, conversationGroupId, conversationId, direction})} removed ${channelListenerTag(key)} (${_.keys(state.channelListeners).length} active)`)
        } else {
            log.warn(`${channelTag({transportId, conversationGroupId, conversationId, direction})} cannot remove non-existing ${channelListenerTag(key)}`)
        }
    }

    const createChannel = ({conversationGroupId, conversationId, direction, linked, in$, out$}) => {
        log.debug(`creating ${channelTag({transportId, conversationGroupId, conversationId, direction})}`)

        const handleReceivedMessage = handler =>
            ({transportId: currentTransportId, conversationGroupId: currentConversationGroupId, conversationId: currentConversationId, message}) => {
                if (_.isEqual(currentTransportId, transportId) && _.isEqual(currentConversationGroupId, conversationGroupId) && _.isEqual(currentConversationId, conversationId)) {
                    log.isTrace()
                        ? log.trace(`Received message from ${channelTag({transportId, conversationGroupId, conversationId})}:`, message)
                        : log.debug(() => `Received message from ${channelTag({transportId, conversationGroupId, conversationId})}: <omitted>`)
                    handler(message)
                }
            }

        const channelPort = {
            sendMessage: (end, message) => {
                log.isTrace()
                    ? log.trace(`Sending message to ${channelTag({transportId, conversationGroupId, conversationId})}:`, message)
                    : log.debug(() => `Sending message to ${channelTag({transportId, conversationGroupId, conversationId})}: <omitted>`)
                messageOut({transportId, conversationGroupId, conversationId, end, message})
            },
            addMessageHandler: messageHandler => {
                const key = uuid()
                const listener = handleReceivedMessage(messageHandler)
                addChannelListener({key, listener, conversationGroupId, conversationId, direction})
                return () => removeChannelListener({key, conversationGroupId, conversationId, direction})
            }
        }

        return channel({channelPort, transportId, conversationGroupId, conversationId, direction, linked, in$, out$})
    }

    const createChannelByCallback = ({conversationGroupId, conversationId, linked, onChannel}) =>
        onChannel(
            createChannel({conversationGroupId, conversationId, direction: REVERSE, linked})
        )

    const createChannelByCallbackMap = ({conversationGroupId, conversationId, linked, handler}) =>
        handler(
            createChannel({conversationGroupId, conversationId, direction: REVERSE, linked})
        )

    const createChannelByStreams = ({conversationGroupId, conversationId, linked, in$, out$}) =>
        createChannel({conversationGroupId, conversationId, direction: REVERSE, linked, in$, out$})

    const handleCreateChannel = ({transportId: currentTranportId, conversationGroupId, conversationId, linked}, onChannel) => {
        if (_.isEqual(currentTranportId, transportId) && conversationGroupId && conversationId && onChannel) {
            if (_.isFunction(onChannel)) {
                createChannelByCallback({conversationGroupId, conversationId, linked, onChannel})
            } else {
                const handler = onChannel[conversationGroupId]
                if (_.isFunction(handler)) {
                    createChannelByCallbackMap({conversationGroupId, conversationId, linked, handler})
                } else if (_.isPlainObject(handler)) {
                    const {in$, out$} = handler
                    createChannelByStreams({conversationGroupId, conversationId, linked, in$, out$})
                } else {
                    log.warn(`Undefined handler for ${channelTag({conversationGroupId, conversationId})}`)
                }
            }
        }
    }
        
    return {
        createChannel: (conversationGroupId, {conversationId = uuid(), linked, in$, out$} = {}) => {
            messageOut({createChannel: {transportId, conversationGroupId, conversationId}})
            return createChannel({conversationGroupId, conversationId, direction: FORWARD, linked, in$, out$})
        },
        messageIn: message => {
            if (message.createChannel && onChannel) {
                handleCreateChannel(message.createChannel, onChannel)
            } else {
                _.forEach(state.channelListeners, channelListener => {
                    if (_.isFunction(channelListener)) {
                        channelListener(message)
                    } else {
                        log.warn(msg('ignored non-function listener'), channelListener)
                    }
                })
            }
        },
        dispose: () => {
            state.channelListeners = {}
        }
    }
}

module.exports = {Transport}
