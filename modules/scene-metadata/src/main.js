const {updateTime} = require('./config')
const {initializeDatabase} = require('./database')
const {downloadLandsat, loadLandsat} = require('./landsatCsv')
const {updateLandsat} = require('./landsatStac')
const {initializeRedis} = require('./redis')
const {downloadSentinel2, loadSentinel2} = require('./sentinel2Csv')
const {updateSentinel2} = require('./sentinel2Stac')
const {getMillisecondsUntilTime, formatInterval, formatTime, parseTime} = require('./time')
const {timer, exhaustMap, from, merge, of, EMPTY} = require('rxjs')

require('#sepal/log').configureServer(require('#config/log.json'))

const MAX_INITIAL_DELAY_MS = 3600 * 1000 // 1 hour

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

const load = async ({redis, database, update, timestamp}) => {
    await loadLandsat({redis, database, timestamp, update})
    await loadSentinel2({redis, database, timestamp, update})
}

const initializeData = async ({redis, database}) => {
    const initialized = await redis.getInitialized()
    if (initialized) {
        log.info('Skipped initialization from CSV files')
    } else {
        const timestamp = new Date()
        log.info(`Initializing database (timestamp: ${timestamp.toISOString()})`)
        const t0 = Date.now()
        await database.prepare()
        await download()
        await load({redis, database, update: false, timestamp})
        await database.finalize()
        await redis.setInitialized(timestamp.toISOString())
        log.info(`Initialized database (${formatInterval(t0)})`)
    }
}

const updateData = async ({redis, database}) => {
    const timestamp = new Date()
    log.info(`Updating database, (timestamp: ${timestamp.toISOString()})`)
    const t0 = Date.now()
    // await download()
    // await loadLandsat({redis, database, timestamp, update: true})
    await updateLandsat({redis, database, timestamp})
    await updateSentinel2({redis, database, timestamp})
    log.info(`Updated database (${formatInterval(t0)})`)
}

const initialUpdate$ = initialDelay => {
    if (initialDelay > MAX_INITIAL_DELAY_MS) {
        log.info('Running initial update before scheduled time')
        return of(true)
    } else {
        log.info('Skipping initial update, will run at scheduled time')
        return EMPTY
    }
}

const dailyUpdate$ = initialDelay =>
    timer(initialDelay, 86400 * 1000) // 24 hours

const scheduleUpdates = ({redis, database}) => {
    const {hours, minutes} = parseTime(updateTime)
    const initialDelay = getMillisecondsUntilTime(hours, minutes)

    log.info(`Scheduling daily updates at ${formatTime({hours, minutes})}`)
    merge(
        initialUpdate$(initialDelay),
        dailyUpdate$(initialDelay)
    ).pipe(
        exhaustMap(() => from(updateData({redis, database})))
    ).subscribe({
        next: () => log.debug('Running scheduled updates'),
        error: error => log.error('Error while running scheduled updates:', error),
        complete: () => log.fatal('Unexpected stream complete')
    })
}

const main = async () => {
    const redis = await initializeRedis()
    const database = await initializeDatabase()
    await initializeData({redis, database})
    scheduleUpdates({redis, database})
}

main().catch(log.fatal)
