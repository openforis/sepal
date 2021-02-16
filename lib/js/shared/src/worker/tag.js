const _ = require('lodash')
const {isMainThread} = require('worker_threads')

const UUID_MATCHER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_DISPLAY_SIZE = 4
const ARG_DELIMITER = '.'

const isUuid = uuid =>
    UUID_MATCHER.test(uuid)

const toString = value =>
    _.isString(value)
        ? isUuid(value)
            ? value.substr(-UUID_DISPLAY_SIZE)
            : value
        : JSON.stringify(value)

const argsJoiner = args =>
    _.compact(args.map(arg => toString(arg))).join(ARG_DELIMITER)

const tag = (tag, ...args) => `${tag}<${argsJoiner(args)}>`

// const requestTag = requestId => `<${requestId}>`
const requestTag = requestId => tag('Request', requestId)

const jobTag = jobName => tag('Job', jobName)

const workerTag = (jobName, workerId) => tag('Worker', jobName, workerId)

const taskTag = taskName => tag('Task', taskName)

const channelTag = ({jobName, workerId, conversationId, direction, end}) =>
    tag('Channel', isMainThread ? 'main' : 'worker', jobName, workerId, conversationId, direction, end)

const channelListenerTag = listenerId =>
    tag('ChannelListener', listenerId)

const transportTag = ({jobName, workerId}) =>
    tag('Transport', isMainThread ? `main:${workerTag(jobName, workerId)}` : `${workerTag(jobName, workerId)}:main`)

module.exports = {
    tag,
    requestTag,
    jobTag,
    workerTag,
    taskTag,
    channelTag,
    channelListenerTag,
    transportTag
}
