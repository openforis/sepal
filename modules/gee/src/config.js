const {Command, Option} = require('commander')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_INSTANCES = 3

const command = new Command()
    .exitOverride()

try {
    command
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
        .parse(process.argv)
} catch (error) {
    log.fatal(error)
    process.exit(1)
}

const {geeEmail,
    sepalUsername,
    sepalPassword,
    sepalEndpoint,
    geeKey,
    googleProjectId,
    port,
    instances
} = command.opts()

const serviceAccountCredentials = {
    client_email: geeEmail,
    private_key: _.replace(geeKey, /\\n/g, '\n')
}

log.info('Configuration loaded')

module.exports = {
    sepalUsername,
    sepalPassword,
    sepalEndpoint,
    googleProjectId,
    serviceAccountCredentials,
    port,
    instances
}
