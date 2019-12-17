const pino = require('pino')

const logger = pino({
    level: process.env.LEVEL || 'info',
    prettyPrint: false
})

module.exports = logger
