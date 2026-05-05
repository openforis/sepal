const {Command, Option} = require('commander')
const log = require('#sepal/log').getLogger('config')

const DEFAULT_HTTP_PORT = 80
const DEFAULT_MANAGEMENT_PORT = 8080
const DEFAULT_MONITOR_ENABLED = true

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--sepal-host <value>')
                .env('SEPAL_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-admin-username <value>')
                .env('SEPAL_ADMIN_USERNAME')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--sepal-admin-password <value>')
                .env('SEPAL_ADMIN_PASSWORD')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_HTTP_PORT)
        )
        .addOption(
            new Option('--management-port <number>')
                .env('MANAGEMENT_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_MANAGEMENT_PORT)
        )
        .addOption(
            new Option('--monitor-enabled <boolean>')
                .env('MONITOR_ENABLED')
                .argParser(v => v === 'true')
                .default(DEFAULT_MONITOR_ENABLED)
        )
        .addOption(
            new Option('--gee-email <value>')
                .env('EE_ACCOUNT')
        )
        .addOption(
            new Option('--gee-key <value>')
                .env('EE_PRIVATE_KEY')
        )
        .addOption(
            new Option('--google-project-id <value>')
                .env('GOOGLE_PROJECT_ID')
        )
        .addOption(
            new Option('--deploy-environment <value>')
                .env('DEPLOY_ENVIRONMENT')
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
    managementPort,
    monitorEnabled,
    sepalHost,
    sepalAdminUsername,
    sepalAdminPassword,
    geeEmail,
    geeKey,
    googleProjectId,
    deployEnvironment,
    appsCatalogUrl
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port,
    managementPort,
    monitorEnabled,
    sepalHost,
    sepalAdminUsername,
    sepalAdminPassword,
    geeEmail,
    geeKey,
    googleProjectId,
    deployEnvironment,
    appsCatalogUrl: appsCatalogUrl || null
}
