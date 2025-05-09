const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')
const _ = require('lodash')

const DEFAULT_PORT = 80

program
    .option('--port <number>', 'Port', DEFAULT_PORT)
    .parse(process.argv)

const {
    port
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    port
}
