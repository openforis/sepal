const program = require('commander')
const log = require('sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 7667

program
    .option('--google-analytics-id <value>')
    .option('--google-maps-api-key <value>')
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .parse(process.argv)

const {
    googleAnalyticsId,
    googleMapsApiKey,
    port
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    googleAnalyticsId,
    googleMapsApiKey,
    port
}
