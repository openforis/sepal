import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {clientTag, subscriptionTag} from './tag.js'
import {createWatcher} from './watcher.js'

const log = getLogger('ws')

const COMMANDS = ['monitor', 'unmonitor', 'remove']

const protocol = async ({send, stop$}) => {
    const watcher = await createWatcher({send, stop$})

    const onClientUp = ({user: {username}, clientId}) => {
        log.info(`${clientTag({username, clientId})} up`)
    }

    const onClientDown = ({user: {username}, clientId}) => {
        log.info(`${clientTag({username, clientId})} down`)
        watcher.offline({username, clientId})
    }

    const onSubscriptionUp = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} up`)
    }

    const onSubscriptionDown = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} down`)
        watcher.unsubscribe({username, clientId, subscriptionId})
    }

    const onMonitor = ({user: {username}, clientId, subscriptionId, paths, reset}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} monitoring path(s):`, paths)
        watcher.monitor({username, clientId, subscriptionId, path: paths, reset})
    }

    const onUnmonitor = ({user: {username}, clientId, subscriptionId, paths}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} unmonitoring path(s):`, paths)
        watcher.unmonitor({username, clientId, subscriptionId, path: paths})
    }

    const onRemove = ({user: {username}, clientId, subscriptionId, paths}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} removing path:`, paths)
        watcher.remove({username, clientId, subscriptionId, path: paths})
    }

    const EVENT_HANDLERS = {
        'clientUp': onClientUp,
        'clientDown': onClientDown,
        'subscriptionUp': onSubscriptionUp,
        'subscriptionDown': onSubscriptionDown,
    }

    const COMMAND_HANDLERS = {
        monitor: onMonitor,
        unmonitor: onUnmonitor,
        remove: onRemove
    }

    const onCommand = ({user, clientId, subscriptionId, data}) => {
        const command = COMMANDS.find(name => Object.hasOwn(data, name))
        if (!command) {
            log.warn(`${messageTag({user, clientId, subscriptionId})} unsupported command: ${Object.keys(data)}`)
        } else if (!isValidCommand(command, data)) {
            log.warn(`${messageTag({user, clientId, subscriptionId})} rejected malformed ${command} command`)
        } else {
            COMMAND_HANDLERS[command]({user, clientId, subscriptionId, paths: data[command], reset: data.reset})
        }
    }

    const onMessage = ({event, data, user, clientId, subscriptionId}) => {
        if (event) {
            const handler = EVENT_HANDLERS[event]
            if (handler) {
                handler({user, clientId, subscriptionId})
            }
        } else if (data) {
            onCommand({user, clientId, subscriptionId, data})
        } else {
            log.warn(`${messageTag({user, clientId, subscriptionId})} unsupported message`)
        }
    }

    // One connection carries every user's commands: a command failing unexpectedly is logged and goes no further.
    return message => {
        try {
            onMessage(message)
        } catch (error) {
            log.error(`${messageTag(message)} command failed`, error)
        }
    }
}

// Paths are whole path strings, the root as '' or '/', alone or as a flat list. A command is checked whole before any
// of it is acted on, so that a malformed one changes nothing.
const isValidCommand = (command, {[command]: paths, reset}) =>
    (isPath(paths) || (Array.isArray(paths) && paths.every(isPath)))
    && (command !== 'monitor' || reset === undefined || typeof reset === 'boolean')

const isPath = path =>
    typeof path === 'string' && !path.includes('\0')

// Names whose command it was, without the rest of the user, whatever shape the message has.
const messageTag = ({user, clientId, subscriptionId}) =>
    subscriptionTag({username: textOf(user?.username), clientId: textOf(clientId), subscriptionId: textOf(subscriptionId)})

const textOf = value =>
    typeof value === 'string' ? value : ''

const ws$ = moduleWs$(protocol)

export default ctx => ws$(ctx.arg$)
