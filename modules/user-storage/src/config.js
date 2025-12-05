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
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--redis-host <value>', 'Redis host')
        .requiredOption('--sepal-host <value>')
        .requiredOption('--sepal-username <value>')
        .requiredOption('--sepal-password <value>')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .requiredOption('--home-dir <value>', 'Base directory of user homes')
        .option('--scan-min-delay-seconds <number>', 'Minimum delay in seconds before rescheduling', parseInt)
        .option('--scan-max-delay-seconds <number>', 'Maximum delay in seconds before rescheduling', parseInt)
        .option('--scan-delay-increase-factor <number>', 'Auto-rescheduling delay increase factor', parseFloat)
        .option('--scan-concurrency <number>', 'Concurrent rescan jobs', parseInt)
        .option('--scan-max-retries <number>', 'Maximum number of retries when job has failed', parseInt)
        .option('--scan-initial-retry-delay-seconds <number>', 'Initial delay in seconds between retries (exponential backoff)', parseInt)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    redisHost,
    sepalHost,
    sepalUsername,
    sepalPassword,
    port,
    homeDir,
    scanMinDelaySeconds = 5,
    scanMaxDelaySeconds = 86400,
    scanDelayIncreaseFactor = 2,
    scanConcurrency = 4,
    scanMaxRetries = 10,
    scanInitialRetryDelaySeconds = 30
} = program.opts()

log.info('Configuration loaded')

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
    amqpUri,
    redisHost,
    sepalHost,
    sepalUsername,
    sepalPassword,
    port,
    homeDir,
    scanMinDelayMilliseconds: scanMinDelaySeconds * 1000,
    scanMaxDelayMilliseconds: scanMaxDelaySeconds * 1000,
    scanDelayIncreaseFactor,
    scanConcurrency,
    scanMaxRetries,
    scanInitialRetryDelayMilliseconds: scanInitialRetryDelaySeconds * 1000
}
