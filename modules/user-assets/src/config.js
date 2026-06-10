import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'
const log = getLogger('config')

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

const redisUri = `redis://${redisHost}`
const pollIntervalMilliseconds = pollIntervalMinutes * 60000

export {pollIntervalMilliseconds, port, redisUri}
