import * as server from '#sepal/httpServer'
import {getLogger} from '#sepal/log'

import {port} from './config.js'
import {routes} from './routes.js'

const log = getLogger('http')

const startHttpServer = async () => {
    await server.start({port, routes})
    log.info(`HTTP server started on port ${port}`)
}

export {startHttpServer}
