import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {normalizeCase as normalizeAssetsCase} from './assetStore.js'
import {port} from './config.js'
import {routes, wsRoutes} from './routes.js'
import {normalizeCase as normalizeUsersCase} from './userStore.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    try {
        await normalizeUsersCase()
        await normalizeAssetsCase()
    } catch (error) {
        log.error('Cannot normalize username case in Redis, continuing', error)
    }

    await server.start({
        port,
        routes,
        wsRoutes
    })

    log.info('Initialized')
}

main().catch(log.fatal)
