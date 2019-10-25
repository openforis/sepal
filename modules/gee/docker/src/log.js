const pino = require('pino')

const logger = pino({
    level: process.env.LEVEL || 'info',
    prettyPrint: false
})

// const logger = console

module.exports = {
    trace: (...args) => logger.trace(...args),
    debug: (...args) => logger.debug(...args),
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args),
    fatal: (...args) => logger.fatal(...args)
}
