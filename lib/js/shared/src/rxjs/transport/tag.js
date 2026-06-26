import {isMainThread} from 'worker_threads'

import {tag} from '#sepal/tag'

const channelTag = ({transportId, conversationGroupId, conversationId, direction, end}) =>
    tag('Channel', isMainThread ? 'main' : 'worker', transportId, conversationGroupId, conversationId, direction, end)

const channelListenerTag = listenerId =>
    tag('ChannelListener', listenerId)

const transportTag = transportId =>
    tag('Transport', isMainThread ? `main:${transportId}` : `${transportId}:main`)

export {
    channelListenerTag,
    channelTag,
    transportTag
}
