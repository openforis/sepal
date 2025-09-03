const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 80
const DEFAULT_POLL_INTERVAL_MINUTES = 1

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .option('--poll-interval-minutes <number>', 'Poll interval (min)', DEFAULT_POLL_INTERVAL_MINUTES)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    redisUri,
    port,
    pollIntervalMinutes
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri,
    port,
    pollIntervalMilliseconds: pollIntervalMinutes * 60000
}
