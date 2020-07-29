const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .requiredOption('--home-dir <value>', 'Base directory of user homes')
        .option('--min-delay-seconds <number>', 'Minimum delay in seconds before rescheduling', parseInt)
        .option('--max-delay-seconds <number>', 'Maximum delay in seconds before rescheduling', parseInt)
        .option('--delay-increase-factor <number>', 'Auto-rescheduling delay increase factor', parseInt)
        .option('--concurrency <number>', 'Concurrent rescan jobs', parseInt)
        .option('--max-retries <number>', 'Maximum number of retries when job has failed', parseInt)
        .option('--initial-retry-delay-seconds <number>', 'Initial delay in seconds between retries (exponential backoff)', parseInt)
        .parse(process.argv)
} catch (error) {
    log.fatal(error)
    process.exit(1)
}
    
const {
    amqpUri,
    redisUri,
    homeDir,
    minDelaySeconds = 5,
    maxDelaySeconds = 86400,
    delayIncreaseFactor = 2,
    concurrency = 4,
    maxRetries = 10,
    initialRetryDelaySeconds = 30
} = program

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    redisUri,
    homeDir,
    minDelayMilliseconds: minDelaySeconds * 1000,
    maxDelayMilliseconds: maxDelaySeconds * 1000,
    delayIncreaseFactor,
    concurrency,
    maxRetries,
    initialRetryDelayMilliseconds: initialRetryDelaySeconds * 1000
}
