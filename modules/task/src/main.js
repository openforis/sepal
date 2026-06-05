import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'
import * as server from '#sepal/httpServer'
import routes from './routes.js'
import {port} from './config.js'
import {initScheduler} from '#sepal/worker/scheduler'
import {STICKY} from '#sepal/worker/staticPool'

configureServer(logConfig)

const log = getLogger('main')


const main = async () => {
    await server.start({
        port,
        routes
    })
    
    initScheduler({name: 'GoogleEarthEngine', strategy: STICKY, instances: 1})

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
