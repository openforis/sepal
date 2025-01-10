const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_PORT = 8001

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--ceo-url <value>', 'URL of CEO')
        .option('--port <number>', 'Port', DEFAULT_PORT)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    port,
    ceoUrl
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port,
    ceoUrl
}
