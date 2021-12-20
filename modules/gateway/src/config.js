const program = require('commander')
const log = require('sepal/log').getLogger('config')

const DEFAULT_PORT = 8001

program
    .requiredOption('--redis-uri <value>', 'Redis URI')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .option('--sepalHost <value>', 'Sepal host', 'localhost')
    .option('--secure', 'Secure', false)
    .parse(process.argv)

const {
    redisUri,
    port,
    sepalHost,
    secure
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri,
    port,
    sepalHost,
    secure
}
