import _ from 'lodash'
import log4js from 'log4js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5000
const DEFAULT_LEVEL = 'info'

let logConfig = null

// log4js 6.x leaves loggers at level OFF until configure() is called, so anything
// logged during startup before configureServer()/configureClient() runs (e.g. config
// parsing and fatal errors) would be silently dropped. Under ESM this is the common
// case: a module's config.js is evaluated during the import phase, before the entry
// module's body calls configureServer(). Apply a console default at import time so
// startup logging is visible; configureServer()/configureClient() override it.
log4js.configure({
    appenders: {console: {type: 'console'}},
    categories: {default: {appenders: ['console'], level: DEFAULT_LEVEL}}
})

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
        ? _.flatten([arg(level)])
        : [arg]

const getArgs = (args, level) =>
    _.flatten(_.map(args, arg => getArg(arg, level)))

const getLogger = name => {
    const logger = log4js.getLogger(name)
    const isTrace = () => logger.isTraceEnabled()
    const isDebug = () => logger.isDebugEnabled()
    const isInfo = () => logger.isInfoEnabled()
    const isWarn = () => logger.isWarnEnabled()
    const isError = () => logger.isErrorEnabled()
    const isFatal = () => logger.isFatalEnabled()
    const level = {isTrace, isDebug, isInfo}

    return {
        isTrace,
        isDebug,
        isInfo,
        trace: (...args) => isTrace() && logger.trace(...getArgs(args, level)),
        debug: (...args) => isDebug() && logger.debug(...getArgs(args, level)),
        info: (...args) => isInfo() && logger.info(...getArgs(args, level)),
        warn: (...args) => isWarn() && logger.warn(...getArgs(args, level)),
        error: (...args) => isError() && logger.error(...getArgs(args, level)),
        fatal: (...args) => isFatal() && logger.fatal(...getArgs(args, level))
    }
}
    
const configureServer = config => {
    logConfig = config
    log4js.configure(serverConfig(config))
    getLogger('logger').debug(`Log server started on port ${getPort(config)}`)
}

const configureClient = config => {
    log4js.configure(clientConfig(config))
    getLogger('logger').debug(`Log client started on port ${getPort(config)}`)
}

const getLogConfig = () =>
    logConfig

export {
    configureClient,
    configureServer,
    getLogConfig,
    getLogger}
