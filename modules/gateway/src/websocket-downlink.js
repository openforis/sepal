const {v4: uuid} = require('uuid')

const {moduleTag, clientTag, userTag} = require('./tag')
const {filter, interval, map, Subject, groupBy, mergeMap, debounceTime, takeUntil, scan} = require('rxjs')
const {USER_UP, USER_DOWN, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN} = require('./websocket-events')

const log = require('#sepal/log').getLogger('websocket/downlink')

const HEARTBEAT_INTERVAL_MS = 10 * 1000

const initializeDownlink = ({servers, clients, wss, onUserConnected, onUserDisconnected}) => {

    const heartbeatResponse$ = new Subject()
    const client$ = new Subject()

    const user$ = client$.pipe(
        groupBy(({user: {username}}) => username),
        mergeMap(user$ => user$.pipe(
            scan(({count}, {user, connected = false, disconnected = false}) => ({
                user,
                count: count + (connected ? 1 : 0) + (disconnected ? -1 : 0),
                connected: !!(count === 0 && connected),
                disconnected: !!(count === 1 && disconnected),
            }), {
                count: 0
            })
        ))
    )

    const userConnected$ = user$.pipe(
        filter(({connected}) => connected),
        map(({user}) => user)
    )

    const userDisconnected$ = user$.pipe(
        filter(({disconnected}) => disconnected),
        map(({user}) => user)
    )

    heartbeatResponse$.pipe(
        groupBy(({clientId}) => clientId),
        mergeMap(groupId$ =>
            groupId$.pipe(
                debounceTime(HEARTBEAT_INTERVAL_MS * 2),
                takeUntil(clients.remove$.pipe(
                    filter(removedClientId$ => removedClientId$ === groupId$.key)
                ))
            )
        )
    ).subscribe({
        next: ({ws, user, clientId}) => onClientDisconnected(ws, user, clientId),
        error: error => log.error('Unexpected heartbeatResponse$ stream error', error),
        complete: () => log.error('Unexpected heartbeatResponse$ stream closed')
    })
    
    userConnected$.subscribe({
        next: user => {
            log.info(`${userTag(user.username)} connected`)
            onUserConnected && onUserConnected(user)
            // servers.broadcast({user, online: true})
            servers.broadcast({user, event: USER_UP})
        },
        error: error => log.error('Unexpected userConnected$ stream error', error),
        complete: () => log.error('Unexpected userConnected$ stream closed')
    })

    userDisconnected$.subscribe({
        next: user => {
            log.info(`${userTag(user.username)} disconnected`)
            onUserDisconnected && onUserDisconnected(user)
            // servers.broadcast({user, online: false})
            servers.broadcast({user, event: USER_DOWN})
        },
        error: error => log.error('Unexpected userDisconnected$ stream error', error),
        complete: () => log.error('Unexpected userDisconnected$ stream closed')
    })

    const onClientConnected = (ws, user) => {
        const clientId = uuid()
        log.info(`${clientTag(user.username, clientId)} connected`)

        const heartbeatRequest$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
            map(() => Date.now())
        )

        const heartbeatSubscription = heartbeatRequest$.subscribe({
            next: hb => {
                log.trace(`Sending heartbeat to user ${user.username}:`, hb)
                clients.send(clientId, {hb})
            },
            error: error => log.error('Unexpected heartbeatRequest$ stream error', error),
            complete: () => log.error('Unexpected heartbeatRequest$ stream closed')
        })

        clients.add(user, clientId, ws, [heartbeatSubscription])
        client$.next({user, clientId, connected: true})

        ws.on('message', message => onClientMessage(ws, message, user, clientId))
        ws.on('error', error => onClientError(ws, user, clientId, error))
        ws.on('close', () => onClientDisconnected(ws, user, clientId))

        clients.send(clientId, {modules: {state: servers.list()}})

        // servers.broadcast({user, clientId, online: true})
        servers.broadcast({user, clientId, event: CLIENT_UP})
    }
    
    const onClientMessage = (ws, message, user, clientId) => {
        if (message) {
            try {
                const {hb, module, subscriptionId, subscribed, unsubscribed, data} = JSON.parse(message)
                if (hb) {
                    log.trace('Heartbeat reply received', hb)
                    heartbeatResponse$.next({ws, user, clientId})
                } else if (subscribed) {
                    servers.send(module, {user, clientId, subscriptionId, event: SUBSCRIPTION_UP})
                } else if (unsubscribed) {
                    servers.send(module, {user, clientId, subscriptionId, event: SUBSCRIPTION_DOWN})
                } else if (data) {
                    if (log.isTrace()) {
                        log.trace(`Forwarding message to ${moduleTag(module)}:`, data)
                    } else {
                        log.debug(`Forwarding message to ${moduleTag(module)}`)
                    }
                    servers.send(module, {user, clientId, subscriptionId, data})
                } else {
                    log.warn('Unsupported client message:', message)
                }
            } catch (error) {
                log.error('Could not parse client message:', error)
            }
        }
    }
    
    const onClientError = (ws, user, clientId, error) => {
        log.error(`${clientTag(user.username, clientId)} error:`, error)
        disconnect(ws, user, clientId)
    }
    
    const onClientDisconnected = (ws, user, clientId) => {
        log.info(`${clientTag(user.username, clientId)} disconnected`)
        disconnect(ws, user, clientId)
    }

    const disconnect = (ws, user, clientId) => {
        ws.terminate()
        client$.next({user, clientId, disconnected: true})
        clients.remove(clientId)

        // servers.broadcast({user, clientId, online: false})
        servers.broadcast({user, clientId, event: CLIENT_DOWN})
    }
    
    const initializeWebSocketServer = () => {
        wss.on('connection', (ws, _req, user) =>
            onClientConnected(ws, user)
        )
    }

    initializeWebSocketServer()
}

module.exports = {initializeDownlink}
