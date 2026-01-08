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
            // new Option('--amqp-host <value>', 'RabbitMQ host')
            new Option('--amqp-host <value>')
                .env('RABBITMQ_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--redis-host <value>')
                .env('REDIS_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-host <value>')
                .env('SEPAL_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-username <value>')
                .env('SEPAL_ADMIN_USERNAME')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-password <value>')
                .env('SEPAL_ADMIN_PASSWORD')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .argParser(parseInt)
                .env('HTTP_PORT')
                .default(80)
        )
        .addOption(
            new Option('--home-dir <value>')
                .env('HOME_DIR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-min-delay-seconds <number>')
                .argParser(parseFloat)
                .env('SCAN_MIN_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-delay-seconds <number>')
                .argParser(parseFloat)
                .env('SCAN_MAX_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-delay-increase-factor <number>')
                .argParser(parseFloat)
                .env('SCAN_DELAY_INCREASE_FACTOR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-concurrency <number>')
                .argParser(parseInt)
                .env('SCAN_CONCURRENCY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-retries <number>')
                .argParser(parseInt)
                .env('SCAN_MAX_RETRIES')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-initial-retry-delay-seconds <number>')
                .argParser(parseFloat)
                .env('SCAN_INITIAL_RETRY_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-timeout-days <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_TIMEOUT_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-notification-delay-days <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_NOTIFICATION_DELAY_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-grace-period-days <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_GRACE_PERIOD_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-max-spread-hours <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_MAX_SPREAD_HOURS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-concurrency <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_CONCURRENCY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-max-retries <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_MAX_RETRIES')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-initial-retry-delay-seconds <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_INITIAL_RETRY_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-user-storage-threshold-mb <number>')
                .argParser(parseFloat)
                .env('INACTIVITY_USER_STORAGE_THRESHOLD_MB')
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
    inactivityMaxSpreadHours,
    inactivityConcurrency,
    inactivityMaxRetries,
    inactivityInitialRetryDelaySeconds,
    inactivityUserStorageThresholdMb
} = command.opts()

if (scanMinDelaySeconds < 5) {
    fatalError(`Argument --scan-min-delay-seconds (${scanMinDelaySeconds}) cannot be less than 5`)
}

if (scanDelayIncreaseFactor <= 1) {
    fatalError(`Argument --scan-delay-increase-factor (${scanDelayIncreaseFactor}) cannot be less or equal to 1`)
}

if (scanMaxDelaySeconds <= scanMinDelaySeconds) {
    fatalError(`Argument --scan-max-delay-seconds (${scanMaxDelaySeconds}) cannot be less or equal to --scan-min-delay-seconds (${scanMinDelaySeconds})`)
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
    inactivityMaxSpread: inactivityMaxSpreadHours * 60 * 60 * 1000,
    inactivityConcurrency,
    inactivityMaxRetries,
    inactivityInitialRetryDelay: inactivityInitialRetryDelaySeconds * 1000,
    inactivityUserStorageThreshold: inactivityUserStorageThresholdMb * 1024 * 1024
}
