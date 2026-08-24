import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80

// Must match the worker's default instance type — the first tagged InstanceType in
// modules/worker/src/hostingService/instanceTypes.js.
const DEFAULT_SANDBOX_INSTANCE_TYPE = 'T3aSmall'

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
        .addOption(
            new Option('--sandbox-default-instance-type <value>')
                .env('SANDBOX_DEFAULT_INSTANCE_TYPE')
                .default(DEFAULT_SANDBOX_INSTANCE_TYPE)
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
    port,
    sandboxDefaultInstanceType
} = program.opts()

log.info('Configuration loaded')

const amqpUri = `amqp://${amqpHost}`
const redisUri = `redis://${redisHost}`

export {
    amqpUri,
    port,
    redisUri,
    sandboxDefaultInstanceType,
    sepalAppsHost,
    sepalHost}
