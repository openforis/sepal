const {Subject, finalize, startWith, takeUntil} = require('rxjs')
const _ = require('lodash')
const {createAssetManager} = require('./assetManager')
const {userTag, subscriptionTag} = require('./tag')
const log = require('#sepal/log').getLogger('ws')

const ws$ = in$ => {
    log.info('Connected')

    const out$ = new Subject()
    const stop$ = new Subject()

    const assetManager = createAssetManager({out$, stop$})

    const onUserUp = ({user}) => {
        log.debug(`${userTag(user.username)} up`)
        assetManager.userUp(user)
    }

    const onUserDown = ({user}) => {
        log.debug(`${userTag(user.username)} down`)
        assetManager.userDown(user)
    }

    const onUserUpdate = ({user}) => {
        log.debug(`${userTag(user.username)} update`)
        assetManager.userUpdate(user)
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
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} remove ${paths}`)
        assetManager.remove({username, clientId, subscriptionId, paths})
    }

    const onCreateFolder = ({user: {username}, clientId, subscriptionId, path}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} create folder ${path}`)
        assetManager.createFolder({username, clientId, subscriptionId, path})
    }

    const EVENT_HANDLERS = {
        'userUp': onUserUp,
        'userDown': onUserDown,
        'userUpdate': onUserUpdate,
        'subscriptionUp': onSubscriptionUp,
        'subscriptionDown': onSubscriptionDown
    }

    const processMessage = message => {
        const {hb, event, user, data, clientId, subscriptionId} = message
        if (hb) {
            out$.next({hb})
        } else if (event) {
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
    }
    
    in$.pipe(
        takeUntil(stop$)
    ).subscribe({
        next: msg => processMessage(msg),
        error: error => log.error('Connection error (unexpected)', error),
        complete: () => log.info('Disconnected')
    })

    return out$.pipe(
        startWith({ready: true}),
        finalize(() => stop$.next())
    )
}

module.exports = ctx => ws$(ctx.args$)
