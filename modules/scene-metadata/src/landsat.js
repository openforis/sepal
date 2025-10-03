const DATASET_BY_PREFIX = {
    LT4: 'LANDSAT_TM',
    LT5: 'LANDSAT_TM',
    LE7: 'LANDSAT_7',
    LC8: 'LANDSAT_8',
    LC9: 'LANDSAT_9'
}

const OPERATIONAL = {
    'landsat-ot': true,
    'landsat-etm': false,
    'landsat-tm': false
}

const getPrefix = sceneId =>
    sceneId.substring(0, 3)

const getDatasetByPrefix = prefix =>
    DATASET_BY_PREFIX[prefix]

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

module.exports = {getPrefix, getDatasetByPrefix, isOperational, isSceneIncluded, getSceneAreaId, getCloudCover}
