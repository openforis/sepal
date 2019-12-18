const log4js = require('log4js')
const _ = require('lodash')

const config = require('./log4js')

log4js.configure(config)

const getArgs = args =>
    _.map(args, arg =>
        _.isObjectLike(arg) && !(arg instanceof Error)
            ? JSON.stringify(arg)
            : arg
    )

module.exports = name => {
    const logger = log4js.getLogger(name)
    return {
        trace: (...args) => logger.trace(...getArgs(args)),
        debug: (...args) => logger.debug(...getArgs(args)),
        info: (...args) => logger.info(...getArgs(args)),
        warn: (...args) => logger.warn(...getArgs(args)),
        error: (...args) => logger.error(...getArgs(args)),
        fatal: (...args) => logger.fatal(...getArgs(args))
    }
}
