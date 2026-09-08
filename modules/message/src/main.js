import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {messageChanged$} from './changed.js'
import {port} from './config.js'
import {initializeDb} from './db.js'
import {MessageApi} from './messageApi.js'
import {MessageRepository} from './messageRepository.js'
import {createRoutes} from './routes.js'
import {createMessageWs} from './ws.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const db = await initializeDb()
    const repository = new MessageRepository(db, () => new Date())
    const api = new MessageApi(repository)
    const notificationWs$ = createMessageWs({
        userNotifications: (username, admin) => api.userNotifications(username, admin),
        messageChanged$
    })
    await server.start({
        port,
        routes: createRoutes(api),
        wsRoutes: {
            '/ws': server.wsStream(ctx => notificationWs$(ctx.arg$)),
        },
    })
    log.info('Initialized')
}

main().catch(log.fatal)
