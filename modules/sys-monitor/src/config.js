const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 7001

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .requiredOption('--sepal-server-log <value>', 'Log file to monitor')
        .option('--initial-delay-minutes <number>', 'Initial delay (mins)', parseInt)
        .option('--auto-rearm-delay-hours <number>', 'Auto re-arm delay (hours)', parseInt)
        .requiredOption('--notify-to <values...>', 'Notifications addressees')
        .option('--notify-from <value>', 'Notifications sender', 'sys-monitor')
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    port,
    sepalServerLog,
    initialDelayMinutes,
    autoRearmDelayHours,
    notifyTo,
    notifyFrom
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    port,
    sepalServerLog,
    initialDelayMinutes,
    autoRearmDelayHours,
    notifyTo,
    notifyFrom
}
