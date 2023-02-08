const program = require('commander')
const Path = require('path')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_HTTP_PORT = 8180
const DEFAULT_AUTO_UPDATE_INTERVAL_HOURS = 24

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--cran-repo <value>', 'CRAN repository')
        .requiredOption('--repo-path <value>', 'Local repository path')
        .requiredOption('--lib-path <value>', 'R lib path')
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--http-port <number>', 'HTTP port', DEFAULT_HTTP_PORT)
        .option('--auto-update-interval-hours <number>', 'Auto-update interval (hours)', DEFAULT_AUTO_UPDATE_INTERVAL_HOURS)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const config = program.opts()

const {
    cranRepo,
    repoPath,
    libPath,
    redisUri,
    httpPort,
    autoUpdateIntervalHours
} = config

log.info('Configuration loaded')
log.debug(config)

module.exports = {
    cranRepo,
    repoPath,
    libPath,
    redisUri,
    httpPort,
    autoUpdateIntervalHours,
    LOCAL_CRAN_REPO: `http://localhost:${httpPort}`,
    CRAN_ROOT: Path.join(repoPath, 'cranroot'),
    GITHUB_ROOT: Path.join(repoPath, 'github')
}
