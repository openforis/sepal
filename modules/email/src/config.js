const program = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

program.exitOverride()

try {
    program
        .requiredOption('--amqp-uri <value>', 'RabbitMQ URI')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--concurrency <number>', 'Concurrent rescan jobs', parseInt)
        .requiredOption('--smtp-host <value>', 'SMTP host')
        .option('--smtp-port <value>', 'SMTP port')
        .option('--smtp-secure <value>', 'SMTP secure', value => value == 'true', false)
        .requiredOption('--smtp-user <value>', 'SMTP user')
        .requiredOption('--smtp-password <value>', 'SMTP password')
        .requiredOption('--smtp-from-domain <value>', 'SMTP from domain')
        .requiredOption('--sepal-host <value>')
        .requiredOption('--sepal-username <value>')
        .requiredOption('--sepal-password <value>')
        .parse(process.argv)
} catch (error) {
    log.fatal(error)
    process.exit(1)
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
    smtpFromDomain,
    sepalHost,
    sepalUsername,
    sepalPassword
} = program.opts()

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
    smtpFromDomain,
    sepalHost,
    sepalUsername,
    sepalPassword
}
