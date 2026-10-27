import {dayOfYearIgnoringLeapDay} from './sceneSearch.js'

const DATASET_BY_PREFIX = {
    LT04: 'LANDSAT_TM',
    LT05: 'LANDSAT_TM',
    LE07: 'LANDSAT_7',
    LC08: 'LANDSAT_8',
    LC09: 'LANDSAT_9'
}

const getDataset = id =>
    DATASET_BY_PREFIX[id.substring(0, 4)]

const isSceneIncluded = ({dataset, collectionCategory, cloudCover}) =>
    dataset
        && ['T1', 'T2'].includes(collectionCategory)
        && cloudCover >= 0

const getSceneAreaId = (wrsPath, wrsRow) =>
    `${parseInt(wrsPath)}_${parseInt(wrsRow)}`

const getCloudCover = (cloudCover, dataset) =>
    dataset === 'LANDSAT_7'
        ? Math.min(100, parseFloat(cloudCover) + 22)
        : parseFloat(cloudCover)

// Earth Search reports numbers, the CSV files strings: 0 is a value, not a missing field.
const isPresent = value =>
    value !== undefined && value !== null && value !== ''

const scene = ({id, dataset, wrsPath, wrsRow, acquiredTimestamp, cloudCover, sunAzimuth, sunElevation}) =>
    [id, dataset, wrsPath, wrsRow, acquiredTimestamp, cloudCover, sunAzimuth, sunElevation].every(isPresent) ? ({
        id,
        source: 'LANDSAT',
        dataset,
        sceneAreaId: getSceneAreaId(wrsPath, wrsRow),
        acquiredTimestamp,
        dayOfYear: dayOfYearIgnoringLeapDay(new Date(acquiredTimestamp)),
        cloudCover: getCloudCover(cloudCover, dataset),
        sunAzimuth: parseFloat(sunAzimuth),
        sunElevation: parseFloat(sunElevation)
    }) : null
                
export {getDataset, isSceneIncluded, scene}
