const log4js = require('log4js')
const _ = require('lodash')

const config = require('./config')

const appenders = {
    // file: {type: 'file', filename: 'gee.log'},
    console: {type: 'console'}
}

const categories = _.mapValues(config, level => ({
    appenders: ['console'],
    level
}))

log4js.configure({
    appenders,
    categories
})

module.exports = name => {
    const logger = log4js.getLogger(name)
    return {
        trace: (...args) => logger.trace(...args),
        debug: (...args) => logger.debug(...args),
        info: (...args) => logger.info(...args),
        warn: (...args) => logger.warn(...args),
        error: (...args) => logger.error(...args),
        fatal: (...args) => logger.fatal(...args)
    }
}
