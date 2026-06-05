import {Command, Option} from 'commander'
import {getLogger} from '#sepal/log'
const log = getLogger('config')

const DEFAULT_UPDATE_INTERVAL_MINUTES = 60
const DEFAULT_MIN_HOURS_PUBLISHED = 24

const fatalError = error => {
    log.fatal(error)
    process.exit(1)
}

const program = new Command()

try {
    program
        .exitOverride()
        .addOption(
            new Option('--redis-host <value>')
                .env('REDIS_HOST')
                .makeOptionMandatory()
        )
        .addOption(
            new Option('--update-interval-minutes <number>')
                .env('UPDATE_INTERVAL_MINUTES')
                .argParser(v => parseInt(v))
                .default(DEFAULT_UPDATE_INTERVAL_MINUTES)
        )
        .addOption(
            new Option('--min-hours-published <number>')
                .env('MIN_HOURS_PUBLISHED')
                .argParser(v => parseInt(v))
                .default(DEFAULT_MIN_HOURS_PUBLISHED)
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    redisHost,
    updateIntervalMinutes,
    minHoursPublished
} = program.opts()

log.fatal('Configuration loaded')

const redisUri = `redis://${redisHost}`

export {redisUri, updateIntervalMinutes, minHoursPublished}
