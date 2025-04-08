const {v4: uuid} = require('uuid')

const {moduleTag, clientTag, userTag} = require('./tag')
const {filter, interval, map, Subject, groupBy, mergeMap, debounceTime, takeUntil, scan} = require('rxjs')
const {USER_UP, USER_DOWN, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN} = require('./websocket-events')

const log = require('#sepal/log').getLogger('websocket/downlink')

const HEARTBEAT_INTERVAL_MS = 10 * 1000
const BUILD_NUMBER = process.env.BUILD_NUMBER

const initializeDownlink = ({servers, clients, wss, userStatus$, toUser$}) => {

    const heartbeatResponse$ = new Subject()
    const client$ = new Subject()

    heartbeatResponse$.pipe(
        groupBy(({clientId}) => clientId),
        mergeMap(clientId$ =>
            clientId$.pipe(
                debounceTime(HEARTBEAT_INTERVAL_MS * 2),
                takeUntil(clientDisconnected$(clientId$.key))
            )
        )
    ).subscribe({
        next: ({user, clientId}) => onClientDisconnected(user, clientId),
        error: error => log.error('Unexpected heartbeatResponse$ stream error', error),
        complete: () => log.error('Unexpected heartbeatResponse$ stream closed')
    })
    
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

    userConnected$.subscribe({
        next: user => {
            log.info(`${userTag(user.username)} connected`)
            userStatus$?.next({event: USER_UP, user})
            servers.broadcast({event: USER_UP, user})
        },
        error: error => log.error('Unexpected userConnected$ stream error', error),
        complete: () => log.error('Unexpected userConnected$ stream closed')
    })

    userDisconnected$.subscribe({
        next: user => {
            log.info(`${userTag(user.username)} disconnected`)
            userStatus$?.next({event: USER_DOWN, user})
            servers.broadcast({event: USER_DOWN, user})
        },
        error: error => log.error('Unexpected userDisconnected$ stream error', error),
        complete: () => log.error('Unexpected userDisconnected$ stream closed')
    })

    toUser$?.subscribe({
        next: ({username, event}) => clients.sendByUsername(username, {event}),
        error: error => log.error('Unexpected toUser$ stream error', error),
        complete: () => log.error('Unexpected toUser$ stream closed')
    })

    const clientDisconnected$ = clientId =>
        client$.pipe(
            filter(({clientId: currentClientId, disconnected}) => currentClientId === clientId && disconnected)
        )

    const onClientConnected = (ws, user) => {
        const clientId = uuid()
        log.info(`${clientTag(user.username, clientId)} connected`)

        const heartbeatRequest$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
            map(() => Date.now())
        )

        heartbeatRequest$.pipe(
            takeUntil(clientDisconnected$(clientId))
        ).subscribe({
            next: hb => {
                log.trace(`Sending heartbeat to user ${user.username}:`, hb)
                clients.send(clientId, {hb})
            },
            error: error => log.error('Unexpected heartbeatRequest$ stream error', error),
            complete: () => log.debug(`${clientTag(user.username, clientId)} heartbeat stopped`)
        })

        clients.add(user.username, clientId, ws)
        client$.next({user, clientId, connected: true})

        ws.on('message', message => onClientMessage(user, clientId, message))
        ws.on('error', error => onClientError(user, clientId, error))
        ws.on('close', () => onClientDisconnected(user, clientId))

        clients.send(clientId, {modules: {state: servers.list()}})
        servers.broadcast({event: CLIENT_UP, user, clientId})
    }
    
    const onClientMessage = (user, clientId, message) => {
        if (message) {
            try {
                const {version, hb, module, subscriptionId, subscribed, unsubscribed, data} = JSON.parse(message)
                if (version) {
                    onClientVersion(user, clientId, version)
                } else if (hb) {
                    log.trace('Heartbeat reply received', hb)
                    heartbeatResponse$.next({user, clientId})
                } else if (subscribed) {
                    clients.addSubscription(clientId, subscriptionId, module)
                    servers.send(module, {event: SUBSCRIPTION_UP, user, clientId, subscriptionId})
                } else if (unsubscribed) {
                    clients.removeSubscription(clientId, subscriptionId)
                    servers.send(module, {event: SUBSCRIPTION_DOWN, user, clientId, subscriptionId})
                } else if (data) {
                    if (log.isTrace()) {
                        log.trace(`Forwarding message to ${moduleTag(module)}:`, data)
                    } else {
                        log.debug(`Forwarding message to ${moduleTag(module)}`)
                    }
                    servers.send(module, {user, clientId, subscriptionId, data})
                } else {
                    log.warn('Unsupported client message:', message.toString())
                }
            } catch (error) {
                log.error('Could not parse client message:', error)
            }
        }
    }

    const onClientVersion = (user, clientId, {buildNumber}) => {
        if (buildNumber !== BUILD_NUMBER) {
            log.info(`${clientTag(user.username, clientId)} running outdated version:`, buildNumber)
            clients.send(clientId, {event: {versionMismatch: true}})
        }
    }

    const onClientError = (user, clientId, error) => {
        log.error(`${clientTag(user.username, clientId)} error:`, error)
        disconnect(user, clientId)
    }
    
    const onClientDisconnected = (user, clientId) => {
        log.info(`${clientTag(user.username, clientId)} disconnected`)
        disconnect(user, clientId)
    }

    const disconnect = (user, clientId) => {
        client$.next({user, clientId, disconnected: true})
        Object.entries(clients.getSubscriptions(clientId)).forEach(([subscriptionId, module]) => {
            clients.removeSubscription(clientId, subscriptionId)
            servers.send(module, {event: SUBSCRIPTION_DOWN, user, clientId, subscriptionId})
        })
        servers.broadcast({event: CLIENT_DOWN, user, clientId})
        clients.remove(clientId)
    }
    
    wss.on('connection', (ws, _req, user) =>
        onClientConnected(ws, user)
    )
}

module.exports = {initializeDownlink}
