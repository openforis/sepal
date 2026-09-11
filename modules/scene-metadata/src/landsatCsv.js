import {parse} from 'date-fns'
import {catchError, concatMap, defer, forkJoin, from, map, of, reduce} from 'rxjs'

import {getLogger} from '#sepal/log'

import {processCSV} from './csv.js'
import {download} from './filesystem.js'
import {getDataset, isSceneIncluded, scene} from './landsat.js'

const log = getLogger('landsat')

const COLLECTIONS = ['landsat-tm', 'landsat-etm', 'landsat-ot']

export const loadLandsat$ = ({database, maxTimestamp, timestamp}) => from(COLLECTIONS).pipe(
    concatMap(collection => defer(() => processCSV({collection, sceneMapper, database, maxTimestamp, timestamp}))),
    reduce((checkpoints, updates) => ({...checkpoints, ...updates}), {})
)

export const downloadLandsat$ = () => forkJoin(COLLECTIONS.map(collection =>
    defer(() => downloadLandsatCollection({collection})).pipe(
        map(() => null),
        catchError(error => of({error}))
    )
)).pipe(
    map(results => {
        const failed = results.find(result => result)
        if (failed) throw failed.error
        return undefined
    })
)

const sceneMapper = ({
    'Landsat Product Identifier L2': productId,
    'WRS Path': wrsPath,
    'WRS Row': wrsRow,
    'Collection Category': collectionCategory,
    'Scene Cloud Cover L1': cloudCover,
    'Sun Azimuth L0RA': sunAzimuthL0,
    'Sun Azimuth L1': sunAzimuthL1,
    'Sun Elevation L0RA': sunElevationL0,
    'Sun Elevation L1': sunElevationL1,
    'Date Acquired': datetime
}) => {
    const dataset = getDataset(productId)
    if (dataset) {
        if (isSceneIncluded({dataset, collectionCategory, cloudCover})) {
            const id = productId.substring(0, 26) + productId.substring(35)
            const acquiredTimestamp = parse(datetime, 'yyyy/MM/dd', new Date()).toISOString()
            return id
                ? scene({
                    id,
                    dataset,
                    wrsPath,
                    wrsRow,
                    acquiredTimestamp,
                    cloudCover,
                    sunAzimuth: sunAzimuthL0 || sunAzimuthL1,
                    sunElevation: sunElevationL0 || sunElevationL1
                })
                : null
        }
    } else {
        log.debug(`Ignoring unexpected id: ${productId}`)
    }
}

// Note: rows are NOT in chronological order by acquisition date

const CSV_URL = {
    'landsat-ot': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L2.csv.gz',
    'landsat-etm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L2.csv.gz',
    'landsat-tm': 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C2_L2.csv.gz'
}

const downloadLandsatCollection = async ({collection}) => {
    await download({
        url: CSV_URL[collection],
        collection
    })
}
