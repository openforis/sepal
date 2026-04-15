const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

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
            new Option('--sepal-host <value>')
                .env('SEPAL_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-apps-host <value>')
                .env('SEPAL_APPS_HOST')
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
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    sepalHost,
    sepalAppsHost,
    amqpHost,
    redisHost,
    port
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    sepalHost,
    sepalAppsHost,
    amqpUri: `amqp://${amqpHost}`,
    redisUri: `redis://${redisHost}`,
    port
}
