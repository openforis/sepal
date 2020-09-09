const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--concurrency <number>', 'Concurrent rescan jobs', parseInt)
        .requiredOption('--smtp-host <value>', 'SMTP host')
        .option('--smtp-port <value>', 'SMTP port')
        .option('--smtp-secure <value>', 'SMTP secure')
        .requiredOption('--smtp-user <value>', 'SMTP user')
        .requiredOption('--smtp-password <value>', 'SMTP password')
        .option('--smtp-from <value>', 'SMTP from')
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    amqpUri,
    redisUri,
    concurrency = 4,
    smtpHost,
    smtpPort = 25,
    smtpSecure = false,
    smtpUser,
    smtpPassword,
    smtpFrom
} = program

log.info('Configuration loaded')

module.exports = {
    amqpUri,
    redisUri,
    concurrency,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFrom
}
