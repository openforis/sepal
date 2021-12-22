const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 8180
const DEFAULT_POLL_INTERVAL_S = 86400

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--cran-repo <value>', 'CRAN repository')
        .requiredOption('--cran-root <value>', 'CRAN root')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .requiredOption('--lib <value>', 'lib path')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .option('--poll-interval-seconds <number>', 'Poll interval (s)', DEFAULT_POLL_INTERVAL_S)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const config = program.opts()

const {
    cranRepo,
    cranRoot,
    redisUri,
    lib,
    port,
    pollIntervalSeconds,
} = config

log.info('Configuration loaded')
log.debug(config)

module.exports = {
    cranRepo,
    cranRoot,
    redisUri,
    lib,
    port,
    pollIntervalSeconds
}
