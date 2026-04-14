const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_POLL_INTERVAL_MINUTES = 1

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--redis-host <value>')
                .env('REDIS_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--poll-interval-minutes <number>')
                .env('POLL_INTERVAL_MINUTES')
                .argParser(v => parseInt(v))
                .default(DEFAULT_POLL_INTERVAL_MINUTES)
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
    redisHost,
    port,
    pollIntervalMinutes
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri: `redis://${redisHost}`,
    port,
    pollIntervalMilliseconds: pollIntervalMinutes * 60000
}
