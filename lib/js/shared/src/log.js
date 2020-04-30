const _ = require('lodash')
const log4js = require('log4js')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5000
const DEFAULT_LEVEL = 'info'

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
    categories: getCategories(config, ['console'])
})

const clientConfig = config => ({
    appenders: {
        network: {
            type: 'tcp',
            host: getHost(config),
            port: getPort(config)
        }
    },
    categories: getCategories(config, ['network'])
})

const getCategories = ({categories}, appenders) => ({
    ...getDefaultCategories(appenders),
    ...getCustomCategories(categories, appenders)
})

const getDefaultCategories = appenders => ({
    default: {appenders, level: DEFAULT_LEVEL}
})

const getCustomCategories = (categories, appenders) =>
    _.mapValues(categories, level => ({
        appenders,
        level
    }))

const getHost = config =>
    config.host || DEFAULT_HOST

const getPort = config =>
    config.port || DEFAULT_PORT

const capitalize = s =>
    s.charAt(0).toUpperCase() + s.slice(1)

const getArg = (arg, first) => {
    if (_.isFunction(arg)) {
        return getArg(arg(), first)
    }
    if (_.isObjectLike(arg) && !(arg instanceof Error)) {
        return JSON.stringify(arg)
    }
    if (_.isString(arg)) {
        return first ? capitalize(arg) : arg
    }
    return arg
}

const getArgs = args =>
    _.map(args, (arg, index) => getArg(arg, index === 0))

const getLogger = name => {
    const logger = log4js.getLogger(name)
    return {
        trace: (...args) => logger.isTraceEnabled() && logger.trace(...getArgs(args)),
        debug: (...args) => logger.isDebugEnabled() && logger.debug(...getArgs(args)),
        info: (...args) => logger.isInfoEnabled() && logger.info(...getArgs(args)),
        warn: (...args) => logger.isWarnEnabled() && logger.warn(...getArgs(args)),
        error: (...args) => logger.isErrorEnabled() && logger.error(...getArgs(args)),
        fatal: (...args) => logger.isFatalEnabled() && logger.fatal(...getArgs(args))
    }
}
    
const configureServer = config => {
    log4js.configure(serverConfig(config))
    getLogger('logger').debug(`Log server started on port ${getPort(config)}`)
}

const configureClient = config => {
    log4js.configure(clientConfig(config))
    getLogger('logger').debug(`Log client started on port ${getPort(config)}`)
}

module.exports = {
    configureServer,
    configureClient,
    getLogger
}
