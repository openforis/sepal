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
        .requiredOption('--notify-email-address <value>', 'Email for notifications')
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    sepalServerLog,
    notifyEmailAddress
} = program

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    sepalServerLog,
    notifyEmailAddress
}
