import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'
import {requireRestrictedHome} from '#sepal/restrictedHome'

import {amqpUri, homeDir, port} from './config.js'
import {filesDeleted$} from './events.js'
import {routes, wsRoutes} from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await requireRestrictedHome(homeDir)
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'files.FilesDeleted', publish$: filesDeleted$}
        ]
    })

    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
