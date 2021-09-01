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

const getArg = (arg, level) =>
    _.isFunction(arg)
        ? getArg(arg(level))
        : arg

const getArgs = (args, level) =>
    _.map(args, (arg, index) => getArg(arg, level, index === 0))

const getLogger = name => {
    const logger = log4js.getLogger(name)
    const level = logger.level.levelStr
    return {
        isTrace: () => logger.isTraceEnabled(),
        isDebug: () => logger.isDebugEnabled(),
        isInfo: () => logger.isInfoEnabled(),
        trace: (...args) => logger.isTraceEnabled() && logger.trace(...getArgs(args, level)),
        debug: (...args) => logger.isDebugEnabled() && logger.debug(...getArgs(args, level)),
        info: (...args) => logger.isInfoEnabled() && logger.info(...getArgs(args, level)),
        warn: (...args) => logger.isWarnEnabled() && logger.warn(...getArgs(args, level)),
        error: (...args) => logger.isErrorEnabled() && logger.error(...getArgs(args, level)),
        fatal: (...args) => logger.isFatalEnabled() && logger.fatal(...getArgs(args, level))
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
