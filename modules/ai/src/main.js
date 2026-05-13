require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')
const config = require('./config')
const {createApp} = require('./app')

createApp({config}).start().catch(error => {
    log.fatal(error)
    process.exit(1)
})
