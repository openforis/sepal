const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 5999
const DEFAULT_POLL_INTERVAL_MS = 1000

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .option('--poll-interval-milliseconds <number>', 'Poll interval (ms)', DEFAULT_POLL_INTERVAL_MS)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    redisUri,
    port,
    pollIntervalMilliseconds
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri,
    port,
    pollIntervalMilliseconds
}
