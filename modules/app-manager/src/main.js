import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'
configureServer(logConfig)

const log = getLogger('main')

import * as server from '#sepal/httpServer'

import {monitorApps} from './apps.js'
import {port} from './config.js'
import routes from './routes.js'

const main = async () => {
    await server.start({
        port,
        routes
    })

    monitorApps()

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
