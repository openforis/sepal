import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {messageChanged$} from './changed.js'
import {port} from './config.js'
import {initializeDatabase} from './db.js'
import {userNotifications} from './messageApi.js'
import {routes} from './routes.js'
import {createMessageWs} from './ws.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await initializeDatabase()
    const notificationWs$ = createMessageWs({userNotifications, messageChanged$})
    await server.start({
        port,
        routes,
        wsRoutes: {
            '/ws': server.wsStream(ctx => notificationWs$(ctx.arg$)),
        },
    })
    log.info('Initialized')
}

main().catch(log.fatal)
