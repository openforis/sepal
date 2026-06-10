import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {port} from './config.js'
import {routes, wsRoutes} from './routes.js'
configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(log.fatal)
