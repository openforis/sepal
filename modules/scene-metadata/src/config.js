import {Command, Option} from 'commander'

import {getLogger} from '#sepal/log'

const log = getLogger('config')

const DEFAULT_PORT = 80
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
            new Option('--port <number>')
                .env('HTTP_PORT')
                .argParser(v => parseInt(v))
                .default(DEFAULT_PORT)
        )
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
        .addOption(
            new Option('--google-maps-api-key <value>')
                .env('GOOGLE_MAPS_API_KEY')
                .default('')
        )
        .addOption(
            new Option('--nicfi-planet-api-key <value>')
                .env('NICFI_PLANET_API_KEY')
                .default('')
        )
        .parse()
} catch (error) {
    fatalError(error)
}

const {
    port,
    redisHost,
    updateIntervalMinutes,
    minHoursPublished,
    googleMapsApiKey,
    nicfiPlanetApiKey,
} = program.opts()

log.info('Configuration loaded')

const redisUri = `redis://${redisHost}`

export {googleMapsApiKey, minHoursPublished, nicfiPlanetApiKey, port, redisUri, updateIntervalMinutes}
