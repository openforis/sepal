import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer} from '#sepal/log'
configureServer(logConfig)

import {getLogger} from '#sepal/log'
const log = getLogger('main')

import {port} from './config.js'
import {routes, wsRoutes} from './routes.js'
import * as server from '#sepal/httpServer'

const main = async () => {
    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(log.fatal)
