const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 5011

program
    .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .parse(process.argv)

const {
    amqpUri,
    port
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    port
}
