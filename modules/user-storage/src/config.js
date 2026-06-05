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
            new Option('--gateway-host <value>')
                .env('GATEWAY_HOST')
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
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--home-dir <value>')
                .env('HOME_DIR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-min-delay-seconds <number>')
                .argParser(v => parseFloat(v))
                .env('SCAN_MIN_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-delay-seconds <number>')
                .argParser(v => parseFloat(v))
                .env('SCAN_MAX_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-delay-increase-factor <number>')
                .argParser(v => parseFloat(v))
                .env('SCAN_DELAY_INCREASE_FACTOR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-concurrency <number>')
                .env('SCAN_CONCURRENCY')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-max-retries <number>')
                .env('SCAN_MAX_RETRIES')
                .argParser(v => parseInt(v))
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--scan-initial-retry-delay-seconds <number>')
                .argParser(v => parseFloat(v))
                .env('SCAN_INITIAL_RETRY_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-timeout-days <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_TIMEOUT_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-notification-delay-days <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_NOTIFICATION_DELAY_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-grace-period-days <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_GRACE_PERIOD_DAYS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-max-spread-hours <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_MAX_SPREAD_HOURS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-concurrency <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_CONCURRENCY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-max-retries <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_MAX_RETRIES')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-initial-retry-delay-seconds <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_INITIAL_RETRY_DELAY_SECONDS')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--inactivity-user-storage-threshold-mb <number>')
                .argParser(v => parseFloat(v))
                .env('INACTIVITY_USER_STORAGE_THRESHOLD_MB')
                .makeOptionMandatory()
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    amqpHost,
    redisHost,
    gatewayHost,
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
} = program.opts()

if (scanMinDelaySeconds < 5) {
    fatalError(`Argument --scan-min-delay-seconds (${scanMinDelaySeconds}) cannot be less than 5`)
}

if (scanDelayIncreaseFactor <= 1) {
    fatalError(`Argument --scan-delay-increase-factor (${scanDelayIncreaseFactor}) cannot be less or equal to 1`)
}

if (scanMaxDelaySeconds <= scanMinDelaySeconds) {
    fatalError(`Argument --scan-max-delay-seconds (${scanMaxDelaySeconds}) cannot be less or equal to --scan-min-delay-seconds (${scanMinDelaySeconds})`)
}

log.info('Configuration loaded')

const amqpUri = `amqp://${amqpHost}`
const scanMinDelay = scanMinDelaySeconds * 1000
const scanMaxDelay = scanMaxDelaySeconds * 1000
const scanInitialRetryDelay = scanInitialRetryDelaySeconds * 1000
const inactivityTimeout = inactivityTimeoutDays * 24 * 60 * 60 * 1000
const inactivityNotificationDelay = inactivityNotificationDelayDays * 24 * 60 * 60 * 1000
const inactivityGracePeriod = inactivityGracePeriodDays * 24 * 60 * 60 * 1000
const inactivityMaxSpread = inactivityMaxSpreadHours * 60 * 60 * 1000
const inactivityInitialRetryDelay = inactivityInitialRetryDelaySeconds * 1000
const inactivityUserStorageThreshold = inactivityUserStorageThresholdMb * 1024 * 1024

export {
    amqpUri,
    redisHost,
    gatewayHost,
    sepalUsername,
    sepalPassword,
    port,
    homeDir,
    scanMinDelay,
    scanMaxDelay,
    scanDelayIncreaseFactor,
    scanConcurrency,
    scanMaxRetries,
    scanInitialRetryDelay,
    inactivityTimeout,
    inactivityNotificationDelay,
    inactivityGracePeriod,
    inactivityMaxSpread,
    inactivityConcurrency,
    inactivityMaxRetries,
    inactivityInitialRetryDelay,
    inactivityUserStorageThreshold
}
