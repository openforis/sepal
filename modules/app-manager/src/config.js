const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_HTTP_PORT = 80

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    port
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port
}
