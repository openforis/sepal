const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_HTTP_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const command = new Command()
    .exitOverride()

try {
    command
        .addOption(
            new Option('--sepal-host <value>')
                .env('SEPAL_HOST')
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
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    sepalHost,
    amqpHost,
    redisHost,
    port
} = command.opts()

log.info('Configuration loaded')

module.exports = {
    sepalHost,
    amqpUri: `amqp://${amqpHost}`,
    redisUri: `redis://${redisHost}`,
    port
}
