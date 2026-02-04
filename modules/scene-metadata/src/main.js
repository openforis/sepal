const {subHours} = require('date-fns/subHours')
const {timer, exhaustMap, from, catchError, EMPTY} = require('rxjs')
const {updateIntervalMinutes, minHoursPublished} = require('./config')
const {initializeDatabase} = require('./database')
const {downloadLandsat, loadLandsat} = require('./landsatCsv')
const {updateLandsat} = require('./landsatStac')
const {initializeRedis} = require('./redis')
const {downloadSentinel2, loadSentinel2} = require('./sentinel2Csv')
const {updateSentinel2} = require('./sentinel2Stac')
const {formatInterval} = require('./time')

require('#sepal/log').configureServer(require('#config/log.json'))

const INITIAL_UPDATE_DELAY_SECONDS = 10

const log = require('#sepal/log').getLogger('main')

const download = async () => {
    log.debug('Downloading CSV files...')
    const t0 = Date.now()
    await Promise.all([
        downloadLandsat(),
        downloadSentinel2()
    ])
    log.info(`Downloaded CSV files (${formatInterval(t0)})`)
}

const load = async ({redis, database, update, maxTimestamp, timestamp}) => {
    await loadLandsat({redis, database, maxTimestamp, timestamp, update})
    await loadSentinel2({redis, database, maxTimestamp, timestamp, update})
}

const initializeData = async ({redis, database}) => {
    const initialized = await redis.getInitialized()
    if (initialized) {
        log.info('Skipped initialization from CSV files')
    } else {
        const maxTimestamp = subHours(new Date(), minHoursPublished).toISOString()
        const timestamp = new Date()
        log.info(`Initializing database (timestamp: ${timestamp.toISOString()})`)
        const t0 = Date.now()
        await database.prepare()
        await download()
        await load({redis, database, update: false, maxTimestamp, timestamp})
        await database.finalize()
        await redis.setInitialized(timestamp.toISOString())
        log.info(`Initialized database (${formatInterval(t0)})`)
    }
}

const updateData = async ({redis, database}) => {
    const timestamp = new Date()
    log.info(`Updating database (timestamp: ${timestamp.toISOString()})`)
    const t0 = Date.now()
    await updateLandsat({redis, database, timestamp})
    await updateSentinel2({redis, database, timestamp})
    log.info(`Updated database (${formatInterval(t0)})`)
}

const scheduleUpdates = ({redis, database}) => {
    log.info(`Running updates every ${updateIntervalMinutes} minutes`)
    timer(INITIAL_UPDATE_DELAY_SECONDS * 1000, updateIntervalMinutes * 60 * 1000).pipe(
        exhaustMap(() =>
            from(updateData({redis, database})).pipe(
                catchError(error => {
                    log.error('Error during scheduled update:', error)
                    return EMPTY
                })
            )
        )
    ).subscribe({
        next: () => log.debug('Running scheduled updates'),
        error: error => log.fatal('Unexpected update scheduler stream error:', error),
        complete: () => log.fatal('Unexpected update scheduler stream complete')
    })
}

const main = async () => {
    const redis = await initializeRedis()
    const database = await initializeDatabase()
    await initializeData({redis, database})
    scheduleUpdates({redis, database})
}

main().catch(log.fatal)
