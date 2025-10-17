const {getDayOfYear} = require('date-fns/getDayOfYear')

const DATASET_BY_PREFIX = {
    LT04: 'LANDSAT_TM',
    LT05: 'LANDSAT_TM',
    LE07: 'LANDSAT_7',
    LC08: 'LANDSAT_8',
    LC09: 'LANDSAT_9'
}

const OPERATIONAL = {
    'landsat-ot': true,
    'landsat-etm': false,
    'landsat-tm': false
}

const getDataset = id =>
    DATASET_BY_PREFIX[id.substring(0, 4)]

const isOperational = source =>
    OPERATIONAL[source] || false

const isSceneIncluded = ({dataSet, collectionCategory, cloudCover}) =>
    dataSet
        && ['T1', 'T2'].includes(collectionCategory)
        && cloudCover >= 0

const getSceneAreaId = (wrsPath, wrsRow) =>
    `${wrsPath}_${wrsRow}`

const getCloudCover = (cloudCover, dataset) =>
    dataset === 'LANDSAT_7'
        ? Math.min(100, parseFloat(cloudCover) + 22)
        : parseFloat(cloudCover)

const scene = ({id, dataSet, wrsPath, wrsRow, acquiredTimestamp, cloudCover, sunAzimuth, sunElevation}) => ({
    id,
    source: 'LANDSAT',
    dataSet,
    sceneAreaId: getSceneAreaId(wrsPath, wrsRow),
    acquiredTimestamp,
    dayOfYear: getDayOfYear(acquiredTimestamp),
    cloudCover: getCloudCover(cloudCover, dataSet),
    sunAzimuth: parseFloat(sunAzimuth),
    sunElevation: parseFloat(sunElevation)
                
})
                
module.exports = {getDataset, isOperational, isSceneIncluded, scene}
