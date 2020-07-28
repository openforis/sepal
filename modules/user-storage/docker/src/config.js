const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

program
    .option('--amqp-uri <value>', 'RabbitMQ URI')
    .option('--redis-uri <value>', 'Redis URI')
    .option('--home-dir <value>', 'Base directory of user homes')
    .option('--min-delay-seconds <number>', 'Minimum delay in seconds before rescheduling', parseInt)
    .option('--max-delay-seconds <number>', 'Maximum delay in seconds before rescheduling', parseInt)
    .option('--concurrency <number>', 'Concurrent rescan jobs', parseInt)
    .parse(process.argv)
    
const {amqpUri, redisUri, homeDir, minDelaySeconds, maxDelaySeconds, concurrency} = program
    
log.info('Configuration loaded')

module.exports = {
    amqpUri,
    redisUri,
    homeDir,
    minDelayMilliseconds: minDelaySeconds * 1000,
    maxDelayMilliseconds: maxDelaySeconds * 1000,
    concurrency
}
