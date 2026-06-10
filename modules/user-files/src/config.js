import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_POLL_INTERVAL_MS = 1000

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--home-dir <value>')
                .env('HOME_DIR')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--poll-interval-milliseconds <number>')
                .argParser(v => parseInt(v))
                .env('POLL_INTERVAL_MS')
                .default(DEFAULT_POLL_INTERVAL_MS)
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    homeDir,
    port,
    pollIntervalMilliseconds,
} = program.opts()

log.info('Configuration loaded')

export {
    homeDir,
    pollIntervalMilliseconds,
    port,
}
