const log = require('#sepal/log').getLogger('foo')
const https = require('https')
const zlib = require('zlib')
const {parse} = require('csv-parse')
const {finished} = require('stream/promises')

const LANDSAT_OT_C2_L1 = 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_OT_C2_L1.csv.gz'
const LANDSAT_ETM_C2_L1 = 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_ETM_C2_L1.csv.gz'
const LANDSAT_TM_C2_L1 = 'https://landsat.usgs.gov/landsat/metadata_service/bulk_metadata_files/LANDSAT_TM_C2_L1.csv.gz'

const getHttpResponse = async url =>
    await new Promise((resolve, reject) => {
        try {
            https.get(url, res => {
                if (res.statusCode === 200) {
                    resolve(res)
                } else {
                    console.error(`Request failed. Status: ${res.statusCode}`)
                    res.resume() // Consume response data to free up memory
                }
            })
        } catch (error) {
            reject(error)
        }
    })

const processUrl = async (url, callback, maxCount) => {
    const res = await getHttpResponse(url)
    const decompressed = res.pipe(zlib.createGunzip())
    const parsed = decompressed.pipe(parse({columns: true}))

    let count = 0

    for await (const record of parsed) {
        count++
        count % 1000 === 0 && log.debug(count)
        callback && callback(record)
        if (maxCount && count === maxCount) {
            decompressed.close()
        }
    }
    
    await finished(parsed)

    log.info('Done')
}

const DATASET_BY_PREFIX = {
    LT4: 'LANDSAT_TM',
    LT5: 'LANDSAT_TM',
    LE7: 'LANDSAT_7',
    LC8: 'LANDSAT_8',
    LC9: 'LANDSAT_9'
}

const getDataSet = data => {
    const prefix = getPrefix(data)
    const dataSetBase = DATASET_BY_PREFIX[prefix]
    return data['Collection Category'] === 'T2'
        ? dataSetBase + '_T2'
        : dataSetBase
}

const getPrefix = data =>
    data['Landsat Scene Identifier'].substring(0, 3)

const getCloudCover = (sensor, data) => {
    const result = parseFloat(data['Scene Cloud Cover L1'])
    return result && sensor === 'LANDSAT_7' && data['Scan Gap Interpolation'] !== '-1'
        ? Math.min(100, result + 22)
        : result
}

const isSceneIncluded = data =>
    ['T1', 'T2'].includes(data['Collection Category'])
         && data['Day/Night Indicator'].toUpperCase() === 'DAY'
         && parseFloat(data['Scene Cloud Cover L1']) >= 0
         && ['LT4', 'LT5', 'LE7', 'LC8', 'LC9'].includes(getPrefix(data))

const getSceneMetaData = (sensor, data) => isSceneIncluded(data)
    ? ({
        id: data['Landsat Scene Identifier'],
        source: 'LANDSAT',
        sceneAreaId: `${data['WRS Path']}_${data['WRS Row']}`,
        dataSet: getDataSet(data),
        acquisitionDate: data['Date Acquired'].substring(2),
        cloudCover: getCloudCover(sensor, data),
        coverage: 100,
        sunAzimuth: data['Sun Azimuth L0RA']
            ? parseFloat(data['Sun Azimuth L0RA'])
            : 0,
        sunElevation: data['Sun Elevation L0RA']
            ? parseFloat(data['Sun Elevation L0RA'])
            : 0,
        browseUrl: data['Browse Link'],
        updateTime: data['Date Product Generated L1'].substring(2)
    })
    : null

const foo = async () => {
    await processUrl(LANDSAT_ETM_C2_L1, row => log.debug(getSceneMetaData('LANDSAT_7', row)), 3)
    await processUrl(LANDSAT_OT_C2_L1, row => log.debug(getSceneMetaData('LANDSAT_OT', row)), 3)
    await processUrl(LANDSAT_TM_C2_L1, row => log.debug(getSceneMetaData('LANDSAT_TM', row)), 3)
}

module.exports = {foo}
