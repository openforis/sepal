require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')
const {initProxy} = require('./proxy')
const {initQueue} = require('./queue')

const main = async () => {
    initProxy()
    await initQueue()
    log.info('Initialized')
}

main().catch(log.fatal)
