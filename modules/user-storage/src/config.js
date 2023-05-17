const program = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 8001

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .requiredOption('--home-dir <value>', 'Base directory of user homes')
        .option('--min-delay-seconds <number>', 'Minimum delay in seconds before rescheduling', parseInt)
        .option('--max-delay-seconds <number>', 'Maximum delay in seconds before rescheduling', parseInt)
        .option('--delay-increase-factor <number>', 'Auto-rescheduling delay increase factor', parseFloat)
        .option('--concurrency <number>', 'Concurrent rescan jobs', parseInt)
        .option('--max-retries <number>', 'Maximum number of retries when job has failed', parseInt)
        .option('--initial-retry-delay-seconds <number>', 'Initial delay in seconds between retries (exponential backoff)', parseInt)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    redisUri,
    port,
    homeDir,
    minDelaySeconds = 5,
    maxDelaySeconds = 86400,
    delayIncreaseFactor = 2,
    concurrency = 4,
    maxRetries = 10,
    initialRetryDelaySeconds = 30
} = program.opts()

log.info('Configuration loaded')

if (minDelaySeconds < 5) {
    fatalError(`Argument --min-delay-seconds (${minDelaySeconds}) cannot be less than 5`)
}

if (delayIncreaseFactor <= 1) {
    fatalError(`Argument --delay-increase-factor (${delayIncreaseFactor}) cannot be less or equal to 1`)
}

if (maxDelaySeconds <= minDelaySeconds) {
    fatalError(`Argument --max-delay-seconds (${maxDelaySeconds}) cannot be less or equal to --min-delay-seconds (${minDelaySeconds})`)
}

module.exports = {
    amqpUri,
    redisUri,
    port,
    homeDir,
    minDelayMilliseconds: minDelaySeconds * 1000,
    maxDelayMilliseconds: maxDelaySeconds * 1000,
    delayIncreaseFactor,
    concurrency,
    maxRetries,
    initialRetryDelayMilliseconds: initialRetryDelaySeconds * 1000
}
