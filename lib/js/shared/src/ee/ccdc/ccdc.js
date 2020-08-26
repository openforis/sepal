const {toGeometry} = require('sepal/ee/aoi')
const {allScenes: createOpticalCollection} = require('sepal/ee/optical/collection')
const {createCollection: createRadarCollection} = require('sepal/ee/radar/collection')
const {calculateIndex, supportedIndexes} = require('sepal/ee/optical/indexes')
const {of, throwError} = require('rx')
const {switchMap} = require('rx/operators')
const ee = require('ee')


module.exports = {
    getTimeSeries$: (
        {
            description, aoi, dataSets, breakpointBands, bands, fromDate, toDate,
            surfaceReflectance, cloudMasking, cloudBuffer, snowMasking, calibrate, brdfCorrect, // Optical
            orbits, geometricCorrection, speckleFilter, outlierRemoval, // Radar
            minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
        }) => {
        const geometry = toGeometry(aoi)
        const reflectance = surfaceReflectance ? 'SR' : 'TOA'


        const executeCCDC = collection => {
            return ee.Algorithms.TemporalSegmentation.Ccdc({
                collection,
                breakpointBands,
                minObservations,
                chiSquareProbability,
                minNumOfYearsScaler,
                lambda,
                maxIterations
            }).clip(geometry)
        }


        const opticalImages = () =>
            createOpticalCollection({
                geometry,
                dataSets: extractDataSets(dataSets),
                reflectance,
                filters: [],
                cloudMasking,
                cloudBuffer,
                snowMasking,
                panSharpen: false,
                calibrate,
                brdfCorrect,
                dates: {
                    seasonStart: fromDate,
                    seasonEnd: toDate
                }
            }).map(image => {
                    const indexes = ee.Image(
                        bands
                            .filter(band => supportedIndexes().includes(band))
                            .map(indexName => calculateIndex(image, indexName).multiply(10000).int16())
                    )
                    return image
                        .addBands(indexes)
                        .select(bands)
                        .clip(geometry)
                }
            )


        const radarImages = () =>
            createRadarCollection({
                startDate: fromDate,
                endDate: toDate,
                targetDate: fromDate,
                geometry,
                orbits,
                geometricCorrection,
                speckleFilter,
                outlierRemoval
            }).map(image => {
                    if (bands.includes('VV/VH')) {
                        return image
                            .addBands(
                                image.select('VV').divide(image.select('VH')).rename('VV/VH')
                            )
                            .select(bands)
                    } else {
                        return image.select(bands)
                    }
                }
            )


        const isRadar = () => dataSets.length === 1 && dataSets[0] === 'SENTINEL_1'


        const extractDataSets = sources =>
            Object.values(sources)
                .flat()
                .map(dataSet =>
                    dataSet === 'LANDSAT_TM'
                        ? ['LANDSAT_4', 'LANDSAT_5']
                        : dataSet === 'LANDSAT_TM_T2'
                        ? ['LANDSAT_4_T2', 'LANDSAT_5_T2']
                        : dataSet
                )
                .flat()

        const collection = isRadar()
            ? radarImages()
            : opticalImages()
        return ee.getInfo$(
            collection.isEmpty(),
            `check if collection is empty (${description})`
        ).pipe(
            switchMap(emptyCollection => {
                    return emptyCollection
                        ? throwError(new Error('There is no imagery to process.'))
                        : of(executeCCDC(collection))
                }
            )
        )
    }
}