const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const command = new Command()
    .exitOverride()

try {
    command
        .addOption(
            new Option('--amqp-host <value>', 'RabbitMQ host')
                .env('RABBITMQ_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--redis-host <value>', 'Redis host')
                .env('REDIS_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-host <value>', 'Sepal host')
                .env('SEPAL_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-username <value>', 'Sepal username')
                .env('SEPAL_ADMIN_USERNAME')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-password <value>', 'Sepal password')
                .env('SEPAL_ADMIN_PASSWORD')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>', 'Port')
                .argParser(parseInt)
                .env('HTTP_PORT')
                .default(80)
        )
        .addOption(
            new Option('--home-dir <value>', 'Base directory of user homes')
                .env('HOME_DIR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-min-delay-seconds <number>', 'Minimum delay in seconds before rescheduling')
                .argParser(parseFloat)
                .env('SCAN_MIN_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-delay-seconds <number>', 'Maximum delay in seconds before rescheduling')
                .argParser(parseFloat)
                .env('SCAN_MAX_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-delay-increase-factor <number>', 'Auto-rescheduling delay increase factor')
                .argParser(parseFloat)
                .env('SCAN_DELAY_INCREASE_FACTOR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-concurrency <number>', 'Concurrent rescan jobs')
                .argParser(parseInt)
                .env('SCAN_CONCURRENCY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-retries <number>', 'Maximum number of retries when job has failed')
                .argParser(parseInt)
                .env('SCAN_MAX_RETRIES')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-initial-retry-delay-seconds <number>', 'Initial delay in seconds between retries (exponential backoff)')
                .argParser(parseFloat)
                .env('SCAN_INITIAL_RETRY_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-timeout-days <number>', 'Inactivity timeout in days')
                .argParser(parseFloat)
                .env('INACTIVITY_TIMEOUT_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-notification-delay-days <number>', 'Inactivity notification delay in days')
                .argParser(parseFloat)
                .env('INACTIVITY_NOTIFICATION_DELAY_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-grace-period-days <number>', 'Inactivity grace period in days')
                .argParser(parseFloat)
                .env('INACTIVITY_GRACE_PERIOD_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-max-spread-hours <number>', 'Maximum spread in hours')
                .argParser(parseFloat)
                .env('INACTIVITY_MAX_SPREAD_HOURS')
                .makeOptionMandatory()
        )
        .parse(process.argv)

    log.info('Configuration loaded')
} catch (error) {
    fatalError(error)
}

const {
    amqpHost,
    redisHost,
    sepalHost,
    sepalUsername,
    sepalPassword,
    port,
    homeDir,
    scanMinDelaySeconds,
    scanMaxDelaySeconds,
    scanDelayIncreaseFactor,
    scanConcurrency,
    scanMaxRetries,
    scanInitialRetryDelaySeconds,
    inactivityTimeoutDays,
    inactivityNotificationDelayDays,
    inactivityGracePeriodDays,
    inactivityMaxSpreadHours
} = command.opts()

if (scanMinDelaySeconds < 5) {
    fatalError(`Argument --min-delay-seconds (${scanMinDelaySeconds}) cannot be less than 5`)
}

if (scanDelayIncreaseFactor <= 1) {
    fatalError(`Argument --delay-increase-factor (${scanDelayIncreaseFactor}) cannot be less or equal to 1`)
}

if (scanMaxDelaySeconds <= scanMinDelaySeconds) {
    fatalError(`Argument --max-delay-seconds (${scanMaxDelaySeconds}) cannot be less or equal to --min-delay-seconds (${scanMinDelaySeconds})`)
}

module.exports = {
    amqpUri: `amqp://${amqpHost}`,
    redisHost,
    sepalHost,
    sepalUsername,
    sepalPassword,
    port,
    homeDir,
    scanMinDelay: scanMinDelaySeconds * 1000,
    scanMaxDelay: scanMaxDelaySeconds * 1000,
    scanDelayIncreaseFactor,
    scanConcurrency,
    scanMaxRetries,
    scanInitialRetryDelay: scanInitialRetryDelaySeconds * 1000,
    inactivityTimeout: inactivityTimeoutDays * 24 * 60 * 60 * 1000,
    inactivityNotificationDelay: inactivityNotificationDelayDays * 24 * 60 * 60 * 1000,
    inactivityGracePeriod: inactivityGracePeriodDays * 24 * 60 * 60 * 1000,
    inactivityMaxSpread: inactivityMaxSpreadHours * 60 * 60 * 1000
}
