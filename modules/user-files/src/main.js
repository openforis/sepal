import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {amqpUri, port} from './config.js'
import {email$} from './email.js'
import {routes, wsRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'email.sendToUser', publish$: email$},
        ],
    })

    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(log.fatal)
