const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80
const DEFAULT_CONCURRENCY = 4
const DEFAULT_SMTP_PORT = 25
const DEFAULT_SMTP_SECURE = false

const command = new Command()
    .exitOverride()

try {
    command
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
            new Option('--port <number>')
                .argParser(parseInt)
                .env('HTTP_PORT')
                .default(DEFAULT_PORT)
        )
        .addOption(
            new Option('--concurrency <number>')
                .argParser(parseInt)
                .env('CONCURRENCY')
                .default(DEFAULT_CONCURRENCY)
        )
        .addOption(
            new Option('--smtp-host <value>')
                .env('SMTP_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--smtp-port <value>')
                .env('SMTP_PORT')
                .default(DEFAULT_SMTP_PORT)
        )
        .addOption(
            new Option('--smtp-secure <value>')
                .env('SMTP_SECURE')
                .argParser(value => value == 'true')
                .default(DEFAULT_SMTP_SECURE)
        )
        .addOption(
            new Option('--smtp-user <value>')
                .env('SMTP_USERNAME')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--smtp-password <value>')
                .env('SMTP_PASSWORD')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--smtp-from-domain <value>')
                .env('SMTP_FROM_DOMAIN')
                .makeOptionMandatory()
        )
        .parse(process.argv)
} catch (error) {
    log.fatal(error)
    process.exit(1)
}

const {
    amqpHost,
    redisHost,
    port,
    concurrency,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFromDomain,
    gatewayHost,
    sepalUsername,
    sepalPassword
} = command.opts()

log.info('Configuration loaded')

module.exports = {
    amqpUri: `amqp://${amqpHost}`,
    redisHost,
    port,
    concurrency,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFromDomain,
    gatewayHost,
    sepalUsername,
    sepalPassword
}
