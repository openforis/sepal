const _ = require('lodash')
const log = require('sepal/log')()
const log4js = require('log4js')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5000

const serverConfig = config => ({
    appenders: {
        console: {
            type: 'console'
        },
        server: {
            type: 'tcp-server',
            host: getHost(config),
            port: getPort(config)
        }
    },
    categories: {
        default: {appenders: ['console'], level: 'info'},
        ... _.mapValues(config.categories, level => ({
            appenders: ['console'],
            level
        }))
    }
})

const clientConfig = config => ({
    appenders: {
        network: {
            type: 'tcp',
            host: getHost(config),
            port: getPort(config)
        }
    },
    categories: {
        default: {appenders: ['network'], level: 'info'},
        ... _.mapValues(config.categories, level => ({
            appenders: ['network'],
            level
        }))
    }
})

const getHost = config =>
    config.host || DEFAULT_HOST

const getPort = config =>
    config.port || DEFAULT_PORT

module.exports = {
    server: config => {
        log4js.configure(serverConfig(config))
        log.info(`Log server started on port ${getPort(config)}`)
    },
    client: config => {
        log4js.configure(clientConfig(config))
        log.info(`Log client started on port ${getPort(config)}`)
    }
}
