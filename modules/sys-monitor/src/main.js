import _ from 'lodash'

import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {initialDelayMinutes, notifyFrom, port} from './config.js'
import {start} from './logMonitor.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await server.start({port})

    if (initialDelayMinutes) {
        log.info(`Starting in ${initialDelayMinutes}m`)
    }
    setTimeout(start, initialDelayMinutes * 60 * 1000)

    log.info(`Notifications will be sent from: ${notifyFrom}`)
}

main().catch(log.fatal)
