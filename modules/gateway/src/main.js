require('#sepal/log').configureServer(require('#config/log.json'))

const {amqpUri, redisUri, port, secure} = require('./config')
const {initializeWebSocketServer} = require('./websocket')
const {isMatch} = require('micromatch')
const express = require('express')
const {createClient} = require('redis')
const Session = require('express-session')
const {v4: uuid} = require('uuid')
const url = require('url')
const {WebSocketServer} = require('ws')
const {Subject, firstValueFrom} = require('rxjs')

const apiMetrics = require('prometheus-api-metrics')
const {RedisStore: RedisSessionStore} = require('connect-redis')

const log = require('#sepal/log').getLogger('gateway')

const {initMessageQueue} = require('#sepal/messageQueue')

const {AuthMiddleware} = require('./authMiddleware')
const {GoogleAccessTokenMiddleware} = require('./googleAccessTokenMiddleware')
const {Proxy} = require('./proxy')
const {SessionManager} = require('./session')
const {setRequestUser, getSessionUsername, removeRequestUser} = require('./user')
const {UserStore} = require('./userStore')
const {initializeGoogleAccessTokenRefresher} = require('./googleAccessToken')
const {usernameTag, urlTag} = require('./tag')
const {webSocketPath} = require('../config/endpoints')

const event$ = new Subject()

const main = async () => {
    const redis = await createClient({url: redisUri})
        .on('connect', () => log.info('Connected to Redis:', redisUri))
        .on('error', err => log.error('Redis connection error', err))
        .connect()

    const userStore = UserStore(redis, event$)
    const sessionStore = new RedisSessionStore({client: redis})

    const {messageHandler, logout, invalidateOtherSessions} = SessionManager(sessionStore)
    const {authMiddleware} = AuthMiddleware(userStore)
    const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(userStore)
    const {proxyEndpoints} = Proxy(userStore, authMiddleware, googleAccessTokenMiddleware)

    const getSecret = async () => {
        const secret = await redis.get('secret')

        if (secret) {
            log.info('Reusing saved secret')
            return secret
        } else {
            const secret = uuid()
            log.info('Creating new secret')
            await redis.set('secret', secret)
            return secret
        }
    }

    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'systemEvent', publish$: event$},
        ],
        subscribers: [
            {queue: 'gateway.userLocked', topic: 'user.UserLocked', handler: messageHandler}
        ]
    })

    const app = express()
    const secret = await getSecret()

    const sessionParser = Session({
        store: sessionStore,
        secret,
        name: 'SEPAL-SESSIONID',
        cookie: {
            httpOnly: true,
            sameSite: secure,
            secure
        },
        proxy: true,
        resave: false,
        saveUninitialized: false,
        unset: 'destroy'
    })
    
    app.use(sessionParser)
    app.use(userStore.userMiddleware)

    // Auth not needed for these endpoints
    app.use('/api/user/logout', logout)
    app.use('/api/user/invalidateOtherSessions', invalidateOtherSessions)
    
    app.use('/api/gateway/metrics', authMiddleware, apiMetrics({metricsPath: '/api/gateway/metrics'}))

    const proxies = proxyEndpoints(app)
    const server = app.listen(port)

    const wss = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false
    })

    // avoid MaxListenersExceededWarning
    server.setMaxListeners(30)

    const webSocketAccessDenied = socket => {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
    }

    const handleGlobalWebSocket = (requestPath, req, socket, head, username) => {
        log.debug(`Requesting WebSocket upgrade for ${requestPath}`)
        wss.handleUpgrade(req, socket, head, ws =>
            wss.emit('connection', ws, req, username)
        )
    }

    const handleProxiedWebSocket = (requestPath, req, socket, head, username) => {
        const {proxy, target} = proxies.find(({path}) => !path || requestPath === path || isMatch(requestPath, `${path}/**`)) || {}
        if (proxy) {
            log.debug(`${usernameTag(username)} Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            log.warn(`${usernameTag(username)} No handler found for WebSocket upgrade "${requestPath}"`)
            webSocketAccessDenied(socket)
        }
    }

    initializeGoogleAccessTokenRefresher({userStore, event$})
    initializeWebSocketServer({wss, userStore, event$})

    // HACK: User has to be injected here as the session is not available in proxyRes and proxyResWsz
    server.on('upgrade', (req, socket, head) => {
        sessionParser(req, {}, () => { // Make sure we have access to session for the websocket
            const username = getSessionUsername(req)
            removeRequestUser(req)
            if (username) {
                const requestPath = url.parse(req.url).pathname
                if (requestPath === webSocketPath) {
                    handleGlobalWebSocket(requestPath, req, socket, head, username)
                } else {
                    firstValueFrom(userStore.getUser$(username))
                        .then(user => {
                            if (user) {
                                log.trace(`${usernameTag(username)} ${urlTag(requestPath)} Setting sepal-user header`)
                                setRequestUser(req, user)
                                handleProxiedWebSocket(requestPath, req, socket, head, username)
                            } else {
                                log.error(`${usernameTag(username)} User unavailable for websocket upgrade`)
                                webSocketAccessDenied(socket)
                            }
                        })
                        .catch(error => {
                            log.error(`${usernameTag(username)} Error fetching user for websocket upgrade`, error)
                            webSocketAccessDenied(socket)
                        })
                }
            } else {
                log.warn('Missing username for websocket upgrade')
                webSocketAccessDenied(socket)
            }
        })
    })
    
    process.on('uncaughtException', error => {
        log.fatal('Uncaught exception', error)
    })
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
