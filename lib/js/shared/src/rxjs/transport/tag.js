const {isMainThread} = require('worker_threads')
const {tag} = require('#sepal/tag')

const channelTag = ({transportId, conversationGroupId, conversationId, direction, end}) =>
    tag('Channel', isMainThread ? 'main' : 'worker', transportId, conversationGroupId, conversationId, direction, end)

const channelListenerTag = listenerId =>
    tag('ChannelListener', listenerId)

const transportTag = transportId =>
    tag('Transport', isMainThread ? `main:${transportId}` : `${transportId}:main`)

module.exports = {
    channelTag,
    channelListenerTag,
    transportTag
}
