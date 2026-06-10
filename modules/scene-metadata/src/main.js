import {subHours} from 'date-fns/subHours'
import {catchError, EMPTY, exhaustMap, from, timer} from 'rxjs'

import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'

import {minHoursPublished, updateIntervalMinutes} from './config.js'
import {initializeDatabase} from './database.js'
import {downloadLandsat, loadLandsat} from './landsatCsv.js'
import {updateLandsat} from './landsatStac.js'
import {initializeRedis} from './redis.js'
import {downloadSentinel2, loadSentinel2} from './sentinel2Csv.js'
import {updateSentinel2} from './sentinel2Stac.js'
import {formatInterval} from './time.js'

configureServer(logConfig)

const INITIAL_UPDATE_DELAY_SECONDS = 10

const log = getLogger('main')

const download = async () => {
    log.debug('Downloading CSV files...')
    const t0 = Date.now()
    await Promise.all([
        downloadLandsat(),
        downloadSentinel2()
    ])
    log.info(`Downloaded CSV files (${formatInterval(t0)})`)
}

const load = async ({redis, database, maxTimestamp, timestamp}) => {
    await loadLandsat({redis, database, maxTimestamp, timestamp})
    await loadSentinel2({redis, database, maxTimestamp, timestamp})
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
        await load({redis, database, maxTimestamp, timestamp})
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
