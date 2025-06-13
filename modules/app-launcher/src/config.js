const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 80
const DEFAULT_MANAGEMENT_PORT = 8080
const DEFAULT_MONITOR_ENABLED = true

program
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .option('--management-port <number>', 'Management Port', DEFAULT_MANAGEMENT_PORT)
    .option('--monitor-enabled', 'Enable app monitoring', DEFAULT_MONITOR_ENABLED)
    .parse(process.argv)

const {
    port,
    managementPort,
    monitorEnabled
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port,
    managementPort,
    monitorEnabled
}
