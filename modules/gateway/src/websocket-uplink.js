const {WebSocket} = require('ws')
const {finalize, map, interval, merge} = require('rxjs')
const {webSocket} = require('rxjs/webSocket')

const {webSocketEndpoints} = require('../config/endpoints')
const {autoRetry} = require('sepal/src/rxjs')
const {moduleTag, clientTag, userTag} = require('./tag')
const {CLIENT_UP, USER_UP, USER_UPDATE} = require('./websocket-events')

const log = require('#sepal/log').getLogger('websocket/uplink')

const HEARTBEAT_INTERVAL_MS = 1 * 1000

const initializeUplink = ({servers, clients, userStore: {getUser, userUpdate$}}) => {
    
    const onUserUpdate = user => {
        log.debug(`${userTag(user.username)} updated`)
        servers.broadcast({event: USER_UPDATE, user})
    }

    userUpdate$.subscribe({
        next: user => onUserUpdate(user),
        error: error => log.error('Unexpected userUpdate$ error', error),
        complete: () => log.error('Unexpected userUpdate$ complete')
    })
    
    const moduleReady = (module, ready) => {
        clients.broadcast({modules: {update: {[module]: ready}}})
        if (ready) {
            clients.forEachUser(username =>
                getUser(username).then(
                    user => servers.send(module, {event: USER_UP, user})
                )
            )
            clients.forEach(({username, clientId}) =>
                getUser(username).then(
                    user => {
                        servers.send(module, {event: CLIENT_UP, user, clientId})
                    }
                )
            )
        }
    }

    const onHeartbeat = (hb, module, upstream$) => {
        log.trace(`Sending heartbeat to ${moduleTag(module)}:`, hb)
        upstream$.next({hb})
    }
    
    const onServerMessage = (msg, module, _upstream$) => {
        const {hb, ready, data, ...other} = msg
        if (hb) {
            log.trace(`Received heartbeat from ${moduleTag(module)}:`, hb)
        } else if (ready) {
            log.info(`${moduleTag(module)} connected`)
            moduleReady(module, true)
        } else if (data) {
            const {username, clientId, subscriptionId} = other
            if (clientId) {
                if (log.isTrace()) {
                    log.trace(`Forwarding message to ${clientTag(username, clientId)}:`, data)
                } else {
                    log.debug(`Forwarding message to ${clientTag(username, clientId)}`)
                }
                clients.send(clientId, {subscriptionId, data})
            } else {
                clients.sendByUsername({module, username}, {data})
            }
        } else {
            log.warn(`Received unexpected message from ${moduleTag(module)}:`, msg)
        }
    }
    
    const onDownstreamError = (error, module) => {
        if (error.type === 'close') {
            log.debug(`Connection to ${moduleTag(module)} closed unexpectedly`)
        } else {
            log.error(`Connection to ${moduleTag(module)} error:`, error)
        }
    }
    
    const onDownstreamComplete = module => {
        log.error(`Connection to ${moduleTag(module)} complete (unexpected)`)
    }
    
    const initializeWebSocketClient = ({module, target}) => {
        log.debug(`Connecting to ${moduleTag(module)}`)

        const upstream$ = webSocket({
            url: target,
            WebSocketCtor: WebSocket
        })
    
        const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
            map(() => Date.now())
        )
    
        const downstream$ = upstream$.pipe(
            autoRetry({
                maxRetries: null,
                minRetryDelay: 1000,
                onRetry: (error, retryMessage, retryDelay, retryCount) => {
                    if (retryCount === 1) {
                        log.info(`${moduleTag(module)} connection lost, retrying every ${retryDelay}ms.`)
                        moduleReady(module, false)
                    }
                }
            }),
            finalize(() => {
                servers.remove(module)
            })
        )

        const subscription = merge(
            heartbeat$.pipe(map(hb => ({hb}))),
            downstream$.pipe(map(rx => ({rx})))
        ).subscribe({
            next: ({hb, rx}) => {
                hb && onHeartbeat(hb, module, upstream$)
                rx && onServerMessage(rx, module, upstream$)
            },
            error: error => onDownstreamError(error, module),
            complete: () => onDownstreamComplete(module),
        })
    
        servers.add(module, upstream$, [subscription])
    }
    
    const initializeWebSocketClients = () => {
        webSocketEndpoints.forEach(webSocketEndpoint =>
            initializeWebSocketClient(webSocketEndpoint)
        )
    }
    
    initializeWebSocketClients()
}

module.exports = {initializeUplink}
