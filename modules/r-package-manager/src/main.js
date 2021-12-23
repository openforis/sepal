require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')
const {init} = require('./proxy')

const main = async () => {
    init()
    log.info('Initialized')
}

main().catch(log.fatal)
