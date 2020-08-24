const {toGeometry} = require('sepal/ee/aoi')
const {allScenes: createOpticalCollection} = require('sepal/ee/optical/collection')
const {createCollection: createRadarCollection} = require('sepal/ee/radar/collection')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const ee = require('ee')

module.exports = {
    // TODO: There is no indicator. There will be breakpointBands and bands to include. tmaskBands?
    // TODO: Pass CCDC parameters
    submit$: (
        id,
        {
            description, aoi, dataSets, fromDate, toDate, indicator, scale,
            surfaceReflectance, cloudMasking, cloudBuffer, snowMasking, calibrate, brdfCorrect, // Optical
            orbits, geometricCorrection, speckleFilter, outlierRemoval // Radar
        }
    ) => {
        const geometry = toGeometry(aoi)
        const reflectance = surfaceReflectance ? 'SR' : 'TOA'


        const createTimeSeries = () => {
            const collection = isRadar()
                ? radarImages()
                : opticalImages()
            return ee.Algorithms.TemporalSegmentation.Ccdc({
                collection,
                breakpointBands: [indicator] // TODO: Should come with configuration
                // TODO: Include other CCDC parameters provided in recipe
            })
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
            }).map(image =>
                // TODO: Not the way to do this. Calculate indexes requested in breakpoint bands, select requested bands
                calculateIndex(image, indicator)
                    .set('date', image.date().format('yyyy-MM-dd'))
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
            }).map(image =>
                (indicator === 'VV/VH'
                        ? image.select('VV').divide(image.select('VH')).rename('VV/VH')
                        : image.select(indicator)
                ).set('date', image.date().format('yyyy-MM-dd'))
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


        const toAsset$ = timeSeries =>
            exportImageToAsset$({
                image: timeSeries,
                description,
                pyramidingPolicy: {'.default': 'sample'},
                scale,
                crs: 'EPSG:4326'
            })

        const timeSeries = createTimeSeries()
        return toAsset$(timeSeries)
    }
}