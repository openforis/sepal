const {isMainThread} = require('worker_threads')
const {tag} = require('sepal/tag')

const channelTag = ({transportId, conversationId, direction, end}) =>
    tag('Channel', isMainThread ? 'main' : 'worker', transportId, conversationId, direction, end)

const channelListenerTag = listenerId =>
    tag('ChannelListener', listenerId)

const transportTag = transportId =>
    tag('Transport', isMainThread ? `main:${transportId}` : `${transportId}:main`)

module.exports = {
    channelTag,
    channelListenerTag,
    transportTag
}
