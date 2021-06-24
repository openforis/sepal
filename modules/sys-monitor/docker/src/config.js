const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--sepal-server-log <value>', 'Log file to monitor')
        .requiredOption('--notify-to <values...>', 'Notifications addressees')
        .option('--notify-from <value>', 'Notifications sender', 'sys-monitor')
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    sepalServerLog,
    notifyTo,
    notifyFrom
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    sepalServerLog,
    notifyTo,
    notifyFrom
}
