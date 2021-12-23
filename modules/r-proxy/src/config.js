const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_HTTP_PORT = 8180

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
        .option('--http-port <number>', 'HTTP port', DEFAULT_HTTP_PORT)
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
    httpPort
} = config

log.info('Configuration loaded')
log.debug(config)

module.exports = {
    cranRepo,
    cranRoot,
    redisUri,
    lib,
    httpPort
}
