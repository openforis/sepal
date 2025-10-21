const {v4: uuid} = require('uuid')

const {moduleTag, clientTag, userTag} = require('./tag')
const {filter, interval, map, Subject, groupBy, mergeMap, debounceTime, takeUntil, scan, switchMap, catchError} = require('rxjs')
const {USER_UP, USER_DOWN, CLIENT_UP, CLIENT_DOWN, SUBSCRIPTION_UP, SUBSCRIPTION_DOWN, CLIENT_VERSION_MISMATCH} = require('./websocket-events')

const log = require('#sepal/log').getLogger('websocket/downlink')

const HEARTBEAT_INTERVAL_MS = 10 * 1000
const BUILD_NUMBER = process.env.BUILD_NUMBER

const initializeDownlink = ({servers, clients, wss, userStore, event$}) => {

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
        next: ({username, clientId}) => onClientDisconnected(username, clientId),
        error: error => log.error('Unexpected heartbeatResponse$ stream error', error),
        complete: () => log.error('Unexpected heartbeatResponse$ stream closed')
    })
    
    const user$ = client$.pipe(
        groupBy(({username}) => username),
        mergeMap(username$ => username$.pipe(
            scan(({count}, {username, connected = false, disconnected = false}) => ({
                username,
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
        switchMap(({username}) =>
            userStore.getUser$(username).pipe(
                map(user => ({username, user})),
                catchError(error => {
                    log.error(`${userTag(username)} failed to get user`, error)
                })
            )
        )
    )

    const userDisconnected$ = user$.pipe(
        filter(({disconnected}) => disconnected),
        switchMap(({username}) =>
            userStore.getUser$(username).pipe(
                map(user => ({username, user})),
                catchError(error => {
                    log.error(`${userTag(username)} failed to get user`, error)
                })
            )
        )
    )

    userConnected$.subscribe({
        next: ({username, user}) => {
            if (user) {
                log.info(`${userTag(username)} connected`)
                event$.next({type: USER_UP, data: {user}})
            } else {
                log.warn(`${userTag(username)} connected, but not found in user store`)
            }
        },
        error: error => log.error('Unexpected userConnected$ stream error', error),
        complete: () => log.error('Unexpected userConnected$ stream closed')
    })

    userDisconnected$.subscribe({
        next: ({username, user}) => {
            if (user) {
                log.info(`${userTag(username)} disconnected`)
                event$.next({type: USER_DOWN, data: {user}})
            } else {
                log.warn(`${userTag(username)} disconnected, but not found in user store`)
            }
        },
        error: error => log.error('Unexpected userDisconnected$ stream error', error),
        complete: () => log.error('Unexpected userDisconnected$ stream closed')
    })

    const clientDisconnected$ = clientId =>
        client$.pipe(
            filter(({clientId: currentClientId, disconnected}) => currentClientId === clientId && disconnected)
        )

    const onClientConnected = (ws, username) => {
        const clientId = uuid()
        log.info(`${clientTag(username, clientId)} connected`)

        const heartbeatRequest$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
            map(() => Date.now())
        )

        heartbeatRequest$.pipe(
            takeUntil(clientDisconnected$(clientId))
        ).subscribe({
            next: hb => {
                log.trace(`Sending heartbeat to user ${username}:`, hb)
                clients.send(clientId, {hb})
            },
            error: error => log.error('Unexpected heartbeatRequest$ stream error', error),
            complete: () => log.debug(`${clientTag(username, clientId)} heartbeat stopped`)
        })

        clients.add(username, clientId, ws)
        client$.next({username, clientId, connected: true})

        ws.on('message', message => onClientMessage(username, clientId, message))
        ws.on('error', error => onClientError(username, clientId, error))
        ws.on('close', () => onClientDisconnected(username, clientId))

        clients.send(clientId, {modules: {state: servers.list()}})
        event$.next({type: CLIENT_UP, data: {username, clientId}})
    }
    
    const onClientMessage = (username, clientId, message) => {
        if (message) {
            try {
                const {version, hb, module, subscriptionId, subscribed, unsubscribed, data} = JSON.parse(message)
                if (version) {
                    onVersion(username, clientId, version)
                } else if (hb) {
                    onHeartbeat(username, clientId, hb)
                } else if (subscribed) {
                    onSubscribed(username, clientId, subscriptionId, module)
                } else if (unsubscribed) {
                    onUnsubscribed(username, clientId, subscriptionId, module)
                } else if (data) {
                    onData(username, clientId, subscriptionId, module, data)
                } else {
                    log.warn('Unsupported client message:', message.toString())
                }
            } catch (error) {
                log.error('Could not parse client message:', error)
            }
        }
    }

    const isOutdatedClientVersion = (clientVersion, serverVersion) => {
        const numericClientVersion = Number(clientVersion)
        const numericServerVersion = Number(serverVersion)
        return isNaN(numericClientVersion) || isNaN(numericServerVersion)
            ? clientVersion !== serverVersion
            : numericClientVersion < numericServerVersion
    }

    const onVersion = (username, clientId, {buildNumber}) => {
        if (isOutdatedClientVersion(buildNumber, BUILD_NUMBER)) {
            log.info(`${clientTag(username, clientId)} running outdated version:`, buildNumber)
            event$.next({type: CLIENT_VERSION_MISMATCH, data: {username, clientId}})
        }
    }

    const onHeartbeat = (username, clientId, hb) => {
        log.trace('Heartbeat reply received', hb)
        heartbeatResponse$.next({username, clientId})
    }

    const onSubscribed = (username, clientId, subscriptionId, module) => {
        clients.addSubscription(clientId, subscriptionId, module)
        event$.next({type: SUBSCRIPTION_UP, data: {module, username, clientId, subscriptionId}})
    }

    const onUnsubscribed = (username, clientId, subscriptionId, module) => {
        clients.removeSubscription(clientId, subscriptionId)
        event$.next({type: SUBSCRIPTION_DOWN, data: {module, username, clientId, subscriptionId}})
    }

    const onData = (username, clientId, subscriptionId, module, data) => {
        if (log.isTrace()) {
            log.trace(`Forwarding message to ${moduleTag(module)}:`, data)
        } else {
            log.debug(`Forwarding message to ${moduleTag(module)}`)
        }
        servers.send(module, {username, clientId, subscriptionId, data})
    }

    const onClientError = (username, clientId, error) => {
        log.error(`${clientTag(username, clientId)} error:`, error)
        disconnect(username, clientId)
    }
    
    const onClientDisconnected = (username, clientId) => {
        log.info(`${clientTag(username, clientId)} disconnected`)
        disconnect(username, clientId)
    }

    const disconnect = (username, clientId) => {
        client$.next({username, clientId, disconnected: true})
        Object.entries(clients.getSubscriptions(clientId)).forEach(([subscriptionId, module]) => {
            clients.removeSubscription(clientId, subscriptionId)
            event$.next({type: SUBSCRIPTION_DOWN, data: {module, username, clientId, subscriptionId}})
        })
        event$.next({type: CLIENT_DOWN, data: {username, clientId}})
        clients.remove(clientId)
    }
    
    wss.on('connection', (ws, _req, username) =>
        onClientConnected(ws, username)
    )
}

module.exports = {initializeDownlink}
