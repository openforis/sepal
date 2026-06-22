import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {bootstrap} from './bootstrap.js'
import {amqpUri, port} from './config.js'
import {initializeDatabase} from './db.js'
import {email$} from './email.js'
import {userLocked$, userUpdated$} from './events.js'
import {routes, wsRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await initializeDatabase()
    await bootstrap()
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'user.UserUpdated', publish$: userUpdated$},
            {key: 'user.UserLocked', publish$: userLocked$},
            {key: 'email.sendToAddress', publish$: email$}
        ]
    })
    await server.start({port, routes, wsRoutes})
    log.info('Initialized')
}

main().catch(log.fatal)
