import * as server from '#sepal/httpServer'
import {getLogger} from '#sepal/log'

import {port} from './config.js'

const log = getLogger('http')

export const startHttpServer = async routes => {
    await server.start({port, routes})
    log.info(`HTTP server started on port ${port}`)
}
