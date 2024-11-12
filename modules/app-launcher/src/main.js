require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')
const server = require('#sepal/httpServer')
const {port} = require('./config')
const routes = require('./routes')

const {createCredentialsFile} = require('./gee')
const {monitorApps} = require('./apps')

const main = async () => {
    await server.start({
        port,
        routes
    })
    
    createCredentialsFile()

    monitorApps()

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
