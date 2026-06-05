import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'
import * as server from '#sepal/httpServer'
import {initScheduler} from '#sepal/worker/scheduler'
import {STICKY} from '#sepal/worker/staticPool'

import {port, instances} from './config.js'
import routes from './routes.js'

configureServer(logConfig)

const log = getLogger('main')


const main = async () => {
    await server.start({
        port,
        routes
    })

    initScheduler({name: 'GoogleEarthEngine', strategy: STICKY, instances})
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
