const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80
const DEFAULT_POLL_INTERVAL_MS = 1000

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--home-dir <value>', 'Base directory of user homes')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .option('--poll-interval-milliseconds <number>', 'Poll interval (ms)', DEFAULT_POLL_INTERVAL_MS)
        .option('--instances <number>', 'Instances', parseInt)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    homeDir,
    port,
    pollIntervalMilliseconds,
    instances
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    homeDir,
    port,
    pollIntervalMilliseconds,
    instances
}
