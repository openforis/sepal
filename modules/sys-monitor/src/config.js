import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'
const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--pushover-api-key <value>')
                .env('PUSHOVER_API_KEY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--pushover-group-key <value>')
                .env('PUSHOVER_GROUP_KEY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-server-log <value>')
                .env('SEPAL_SERVER_LOG')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--initial-delay-minutes <number>')
                .env('INITIAL_DELAY_MINUTES')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--auto-rearm-delay-hours <number>')
                .env('AUTO_REARM_DELAY_HOURS')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--notify-from <value>')
                .env('NOTIFY_FROM')
                .default('sys-monitor')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--emergency-notification-retry-delay <number>')
                .env('EMERGENCY_NOTIFICATION_RETRY_DELAY')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--emergency-notification-retry-timeout <number>')
                .env('EMERGENCY_NOTIFICATION_RETRY_TIMEOUT')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .parse()
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

export {
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
