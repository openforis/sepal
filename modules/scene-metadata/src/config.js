const {program} = require('commander')
const log = require('#sepal/log').getLogger('config')

const UPDATE_INTERVAL_MINUTES = 60
const MIN_HOURS_PUBLISHED = 24

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

program.exitOverride()

try {
    program
        .requiredOption('--redis-uri <value>', 'Redis URI')
        .option('--update-interval-minutes <number>', 'Update interval minutes (minutes)', UPDATE_INTERVAL_MINUTES)
        .option('--min-hours-published <number>', 'Min hours published (hours)', MIN_HOURS_PUBLISHED)
        .parse(process.argv)
} catch (error) {
    fatalError(error)
}

const {
    redisUri,
    updateIntervalMinutes,
    minHoursPublished
} = program.opts()

log.info('Configuration loaded')

module.exports = {
    redisUri,
    updateIntervalMinutes,
    minHoursPublished
}
