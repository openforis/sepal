import logConfig from '#config/log.json' with {type: 'json'}
import {eeAccountTag} from '#gee/jobs/eeRequestContext'
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initScheduler} from '#sepal/worker/scheduler'
import {ROUND_ROBIN} from '#sepal/worker/staticPool'

import {googleProjectId, instances, port} from './config.js'
import routes from './routes.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await server.start({
        port,
        routes,
        requestTag: (username, requestId, sepalUser) =>
            `<${username}:${requestId}> ${eeAccountTag(sepalUser, googleProjectId)}`
    })

    initScheduler({name: 'GoogleEarthEngine', strategy: ROUND_ROBIN, instances})
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
