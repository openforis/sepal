import {concatMap, defer} from 'rxjs'

import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'

import {minHoursPublished, updateIntervalMinutes} from './config.js'
import {DataApi} from './dataApi.js'
import {initializeDb} from './db.js'
import {startHttpServer} from './httpServer.js'
import {IngestionCoordinator} from './ingestionCoordinator.js'
import {downloadLandsat$, loadLandsat$} from './landsatCsv.js'
import {updateLandsat$} from './landsatStac.js'
import {initializeRedis} from './redis.js'
import {createRoutes} from './routes.js'
import {SceneIngestor} from './sceneIngestor.js'
import {SceneRepository} from './sceneRepository.js'
import {downloadSentinel2$, loadSentinel2$} from './sentinel2Csv.js'
import {updateSentinel2$} from './sentinel2Stac.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const redis = await initializeRedis()
    const {db, created} = await initializeDb()
    const clock = () => new Date()
    const sceneRepository = new SceneRepository(db, clock)
    const sceneIngestor = new SceneIngestor(db)
    const ingestion = new IngestionCoordinator({
        redis, sceneIngestor, clock, minHoursPublished, updateIntervalMinutes,
        sources: [
            {download$: downloadLandsat$, load$: loadLandsat$, update$: updateLandsat$},
            {download$: downloadSentinel2$, load$: loadSentinel2$, update$: updateSentinel2$}
        ]
    })
    return ingestion.start$(created).pipe(
        concatMap(() => defer(() => startHttpServer(createRoutes(new DataApi(sceneRepository)))))
    ).subscribe({error: fail})
}

const fail = error => {
    log.fatal(error)
    process.exit(1)
}
main().catch(fail)
