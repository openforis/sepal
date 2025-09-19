const {program} = require('commander')
const _ = require('lodash')

const DEFAULT_PORT = 80
const DEFAULT_MANAGEMENT_PORT = 8080
const DEFAULT_MONITOR_ENABLED = true

program
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .option('--management-port <number>', 'Management port', DEFAULT_MANAGEMENT_PORT)
    .option('--monitor-enabled', 'Enable app monitoring', DEFAULT_MONITOR_ENABLED)
    .option('--sepal-host <value>')
    .option('--sepal-admin-password <value>')
    .option('--gee-email <value>')
    .option('--gee-key <value>')
    .option('--google-project-id <value>')
    .option('--gee-client-id <value>')
    .option('--deploy-environment <value>')
    .parse(process.argv)

const {
    port,
    managementPort,
    monitorEnabled,
    sepalHost,
    sepalAdminPassword,
    geeEmail,
    geeKey,
    googleProjectId,
    geeClientId,
    deployEnvironment
} = program.opts()

const config = {
    port,
    managementPort,
    monitorEnabled,
    sepalHost,
    sepalAdminPassword,
    geeEmail,
    geeKey,
    googleProjectId,
    geeClientId,
    deployEnvironment
    
}
module.exports = config
