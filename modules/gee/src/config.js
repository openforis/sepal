import {Command, Option} from 'commander'
import _ from 'lodash'

import {getLogger} from '#sepal/log'
const log = getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_INSTANCES = 3

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--sepal-username <value>')
                .env('SEPAL_ADMIN_USERNAME')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-password <value>')
                .env('SEPAL_ADMIN_PASSWORD')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-endpoint <value>')
                .env('SEPAL_ENDPOINT')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--google-project-id <value>')
                .env('GOOGLE_PROJECT_ID')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--gee-email <value>')
                .env('EE_ACCOUNT')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--gee-key <value>')
                .env('EE_PRIVATE_KEY')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--instances <number>')
                .env('INSTANCES')
                .argParser(v => parseInt(v))
                .default(DEFAULT_INSTANCES)
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {geeEmail,
    sepalUsername,
    sepalPassword,
    sepalEndpoint,
    geeKey,
    googleProjectId,
    port,
    instances
} = program.opts()

const serviceAccountCredentials = {
    client_email: geeEmail,
    private_key: _.replace(geeKey, /\\n/g, '\n')
}

log.info('Configuration loaded')

export {
    googleProjectId,
    instances,
    port,
    sepalEndpoint,
    sepalPassword,
    sepalUsername,
    serviceAccountCredentials}
