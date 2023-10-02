const program = require('commander')
const Path = require('path')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')
const os = require('os')
const {mkdirSync} = require('fs')

const DEFAULT_HTTP_PORT = 8180
const DEFAULT_AUTO_UPDATE_INTERVAL_HOURS = 24

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--os-release <value>', 'OS release')
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
    osRelease,
    cranRepo,
    repoPath,
    libPath,
    redisUri,
    httpPort,
    autoUpdateIntervalHours
} = config

log.info('Configuration loaded')
log.debug(config)

const platformVersion = `${osRelease}-${os.release()}`.replace(/\s+/g, '_')
const platformReleaseRepoPath = Path.join(repoPath, platformVersion)
const platformReleaseLibPath = Path.join(libPath, platformVersion)

mkdirSync(platformReleaseRepoPath, {recursive: true})
mkdirSync(platformReleaseLibPath, {recursive: true})

module.exports = {
    platformVersion,
    cranRepo,
    repoPath: platformReleaseRepoPath,
    libPath: platformReleaseLibPath,
    redisUri,
    httpPort,
    autoUpdateIntervalHours,
    LOCAL_CRAN_REPO: `http://localhost:${httpPort}`,
    CRAN_ROOT: Path.join(platformReleaseRepoPath, 'cranroot'),
    GITHUB_ROOT: Path.join(platformReleaseRepoPath, 'github')
}
