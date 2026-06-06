import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'
const log = getLogger('config')

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
        .addOption(
            new Option('--apps-catalog-url <value>')
                .env('SEPAL_APPS_CATALOG_URL')
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    port,
    appsCatalogUrl: appsCatalogUrlArg
} = program.opts()

log.info('Configuration loaded')

const appsCatalogUrl = appsCatalogUrlArg || null

export {
    appsCatalogUrl,
    port}
