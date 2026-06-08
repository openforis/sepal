import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'
configureServer(logConfig)

const log = getLogger('main')

import * as server from '#sepal/httpServer'

import {port} from './config.js'
import {routes, wsRoutes} from './routes.js'

const main = async () => {
    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(log.fatal)
