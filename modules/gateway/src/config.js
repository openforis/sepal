const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80

program
    .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
    .requiredOption('--redis-uri <value>', 'Redis URI')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .option('--sepalHost <value>', 'Sepal host', 'localhost')
    .option('--secure', 'Secure', false)
    .parse(process.argv)

const {
    amqpUri,
    redisUri,
    port,
    sepalHost,
    secure
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    redisUri,
    port,
    sepalHost,
    secure
}
