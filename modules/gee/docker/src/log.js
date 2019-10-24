const pino = require('pino')

const logger = pino({
    level: process.env.LEVEL || 'info',
    prettyPrint: false
})

module.exports = {
    trace: msg => logger.trace(msg),
    debug: msg => logger.debug(msg),
    info: msg => logger.info(msg),
    warn: msg => logger.warn(msg),
    error: msg => logger.error(msg),
    fatal: msg => logger.fatal(msg)
}
