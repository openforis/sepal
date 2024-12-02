require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {port, initialDelayMinutes, notifyFrom} = require('./config')
const server = require('#sepal/httpServer')
const {start} = require('./logMonitor')

const main = async () => {
    await server.start({port})

    if (initialDelayMinutes) {
        log.info(`Starting in ${initialDelayMinutes}m`)
    }
    setTimeout(start, initialDelayMinutes * 60 * 1000)

    log.info(`Notifications will be sent from: ${notifyFrom}`)
}

main().catch(log.fatal)
