import {program} from 'commander'
import Path from 'path'

import {getLogger} from '#sepal/log'
const log = getLogger('config')
import {mkdirSync} from 'fs'
import _ from 'lodash'
import os from 'os'

const DEFAULT_HTTP_PORT = 80
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
        .requiredOption('--redis-host <value>', 'Redis host')
        .option('--http-port <number>', 'HTTP port', DEFAULT_HTTP_PORT)
        .option('--auto-update-interval-hours <number>', 'Auto-update interval (hours)', DEFAULT_AUTO_UPDATE_INTERVAL_HOURS)
        .option('--update-now', 'Update now')
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
    redisHost,
    httpPort,
    autoUpdateIntervalHours,
    updateNow
} = config

log.info('Configuration loaded')
log.debug(config)

const kernelVersion = os.release().match(/(\d+\.\d+)/)[0]
const platformVersion = `${osRelease}-kernel-${kernelVersion}`.replace(/\s+/g, '_')

const platformReleaseRepoPath = Path.join(repoPath, platformVersion)
const platformReleaseLibPath = Path.join(libPath, platformVersion)

mkdirSync(platformReleaseRepoPath, {recursive: true})
mkdirSync(platformReleaseLibPath, {recursive: true})

const LOCAL_CRAN_REPO = `http://localhost:${httpPort}`
const CRAN_ROOT = Path.join(platformReleaseRepoPath, 'cranroot')
const GITHUB_ROOT = Path.join(platformReleaseRepoPath, 'github')

export {
    autoUpdateIntervalHours,
    CRAN_ROOT,
    cranRepo,
    GITHUB_ROOT,
    httpPort,
    platformReleaseLibPath as libPath,
    LOCAL_CRAN_REPO,
    platformVersion,
    redisHost,
    platformReleaseRepoPath as repoPath,
    updateNow}
