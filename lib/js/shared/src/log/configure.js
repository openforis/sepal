const _ = require('lodash')
const log4js = require('log4js')

const serverConfig = config => ({
    appenders: {
        console: {
            type: 'console'
        },
        server: {
            type: 'tcp-server',
            host: '127.0.0.1'
        }
    },
    categories: {
        default: {appenders: ['console'], level: 'info'},
        ... _.mapValues(config, level => ({
            appenders: ['console'],
            level
        }))
    }
})

const clientConfig = config => ({
    appenders: {
        network: {
            type: 'tcp',
            host: '127.0.0.1'
        }
    },
    categories: {
        default: {appenders: ['network'], level: 'info'},
        ... _.mapValues(config, level => ({
            appenders: ['network'],
            level
        }))
    }
})

module.exports = {
    server: config => log4js.configure(serverConfig(config)),
    client: config => log4js.configure(clientConfig(config))
}
