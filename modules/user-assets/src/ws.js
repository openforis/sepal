import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {createAssetManager} from './assetManager.js'
import {subscriptionTag, userTag} from './tag.js'

const log = getLogger('ws')

const isAssetPath = path =>
    Array.isArray(path) && path.length > 0 && path.every(segment => typeof segment === 'string' && segment.length > 0)

const protocol = ({send, stop$}) => {
    const assetManager = createAssetManager({send, stop$})

    const onUserUp = ({user}) => {
        log.debug(`${userTag(user.username)} up`)
        assetManager.userUp(user)
    }

    const onUserDown = ({user}) => {
        log.debug(`${userTag(user.username)} down`)
        assetManager.userDown(user)
    }

    const onGoogleAccessTokenAdded = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token added`)
        assetManager.googleAccessToken({user, added: true})
    }

    const onGoogleAccessTokenUpdated = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token updated`)
        assetManager.googleAccessToken({user, updated: true})
    }

    const onGoogleAccessTokenRemoved = ({user}) => {
        log.debug(`${userTag(user.username)} Google access token removed`)
        assetManager.googleAccessToken({user, removed: true})
    }

    const onSubscriptionUp = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} up`)
        assetManager.subscriptionUp({username, clientId, subscriptionId})
    }

    const onSubscriptionDown = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} down`)
        assetManager.subscriptionDown({username, clientId, subscriptionId})
    }

    const onReload = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} reload`)
        assetManager.reload({username, clientId, subscriptionId})
    }

    const onCancelReload = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} cancel reload`)
        assetManager.cancelReload({username, clientId, subscriptionId})
    }

    const onRemove = ({user: {username}, clientId, subscriptionId, paths}) => {
        if (!Array.isArray(paths) || !paths.every(isAssetPath)) {
            log.warn(`${userTag(username)} Invalid asset removal paths`)
            return
        }
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} remove ${paths}`)
        assetManager.remove({username, clientId, subscriptionId, paths})
    }

    const onCreateFolder = ({user: {username}, clientId, subscriptionId, path}) => {
        if (!isAssetPath(path)) {
            log.warn(`${userTag(username)} Invalid asset folder path`)
            return
        }
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} create folder ${path}`)
        assetManager.createFolder({username, clientId, subscriptionId, path})
    }

    const EVENT_HANDLERS = {
        'userUp': onUserUp,
        'userDown': onUserDown,
        'googleAccessTokenAdded': onGoogleAccessTokenAdded,
        'googleAccessTokenUpdated': onGoogleAccessTokenUpdated,
        'googleAccessTokenRemoved': onGoogleAccessTokenRemoved,
        'subscriptionUp': onSubscriptionUp,
        'subscriptionDown': onSubscriptionDown
    }

    return message => {
        try {
            const {event, user, data, clientId, subscriptionId} = message
            if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({user, clientId, subscriptionId})
                }
            } else if (data) {
                const {reload, cancelReload, remove, createFolder} = data
                if (reload) {
                    onReload({user, clientId, subscriptionId})
                } else if (cancelReload) {
                    onCancelReload({user, clientId, subscriptionId})
                } else if (remove) {
                    onRemove({user, clientId, subscriptionId, paths: remove})
                } else if (createFolder) {
                    onCreateFolder({user, clientId, subscriptionId, path: createFolder})
                } else {
                    log.warn('Unsupported message data:', data)
                }
            } else {
                log.warn('Unsupported message:', message)
            }
        } catch (error) {
            log.warn('Asset command failed', error)
        }
    }
}

const ws$ = moduleWs$(protocol)

export default ctx => ws$(ctx.arg$)
