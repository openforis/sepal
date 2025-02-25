const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--pushover-api-key <value>', 'Pushover API key')
        .requiredOption('--pushover-group-key <value>', 'Pushover group key')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .requiredOption('--sepal-server-log <value>', 'Log file to monitor')
        .option('--initial-delay-minutes <number>', 'Initial delay (mins)', parseInt)
        .option('--auto-rearm-delay-hours <number>', 'Auto re-arm delay (hours)', parseInt)        // .requiredOption('--notify-to <values...>', 'Notifications addressees')
        .option('--notify-from <value>', 'Notifications sender', 'sys-monitor')
        .option('--emergency-notification-retry-delay <value>', 'Emergency notification retry delay', parseInt)
        .option('--emergency-notification-retry-timeout <value>', 'Emergency notification retry timeout', parseInt)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    pushoverApiKey,
    pushoverGroupKey,
    port,
    sepalServerLog,
    initialDelayMinutes,
    autoRearmDelayHours,
    notifyFrom,
    emergencyNotificationRetryDelay,
    emergencyNotificationRetryTimeout
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    pushoverApiKey,
    pushoverGroupKey,
    port,
    sepalServerLog,
    initialDelayMinutes,
    autoRearmDelayHours,
    notifyFrom,
    emergencyNotificationRetryDelay,
    emergencyNotificationRetryTimeout
}
