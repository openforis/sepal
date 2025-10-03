const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const UPDATE_TIME = '00:00'
const MIN_DAYS_PUBLISHED = 3

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--update-time <string>', 'Update hours (h)', UPDATE_TIME)
        .option('--min-days-published <number>', 'Min days published (days)', MIN_DAYS_PUBLISHED)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    redisUri,
    updateTime,
    minDaysPublished
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri,
    updateTime,
    minDaysPublished
}
