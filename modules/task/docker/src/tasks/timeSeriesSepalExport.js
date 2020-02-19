const {toGeometry, toFeatureCollection} = require('sepal/ee/aoi')
const {allScenes} = require('sepal/ee/optical/collection')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const tile = require('sepal/ee/tile')
const {exportImageToSepal$} = require('root/ee/export')
const log = require('sepal/log').getLogger('task')
const {from} = require('rxjs')
const {mergeMap, switchMap, tap} = require('rxjs/operators')
const ee = require('ee')
const {chunk} = require('sepal/utils/array')

const TILE_DEGREES = 0.9
const MAX_STACK_SIZE = 2

module.exports = {
    submit$: (id, recipe) => {
        const {
            aoi, dataSets, surfaceReflectance, cloudMasking, cloudBuffer,
            snowMasking, calibrate, brdfCorrect, fromDate, toDate, indicator,
            scale
        } = recipe
        log.warn(recipe)
        const geometry = toGeometry(aoi)
        const reflectance = surfaceReflectance ? 'SR' : 'TOA'
        const dates = {
            seasonStart: fromDate,
            seasonEnd: toDate
        }
        const images = allScenes({
            geometry,
            dataSets,
            reflectance,
            filters: [],
            cloudMasking,
            cloudBuffer,
            snowMasking,
            panSharpen: false,
            calibrate,
            brdfCorrect,
            dates
        }).map(image =>
            calculateIndex(image, indicator)
                .set('date', image.date().format('yyyy-MM-dd')))

        const tiles = tile(toFeatureCollection(aoi), TILE_DEGREES)

        const timeSeriesForFeature = (feature, images) => {
            const featureImages = images
                .filterBounds(feature.geometry())
            const distinctDateImages = featureImages.distinct('date')
            return ee.ImageCollection(ee.Join.saveAll('images')
                .apply({
                    primary: distinctDateImages,
                    secondary: featureImages,
                    condition: ee.Filter.equals({
                        leftField: 'date',
                        rightField: 'date'
                    })
                })
                .map(image => ee.ImageCollection(ee.List(image.get('images')))
                    .median()
                    .rename(image.getString('date'))))
                .toBands()
                .regexpRename('.*(.{10})', '$1')
                .clip(feature.geometry())
        }

        const exportTile = ({tileId, tileIndex}) => {
            const tile = tiles.filterMetadata('system:index', 'equals', tileId).first()
            const timeSeries = timeSeriesForFeature(tile, images)

            const exportChunk = dates => {
                const image = timeSeries.select(dates)
                const firstDate = dates[0]
                const lastDate = dates[dates.length - 1]
                const description = `time_series_${tileIndex}_${firstDate}_${lastDate}`
                const downloadDir = null
                return exportImageToSepal$({
                    image, description, downloadDir, scale, crs: 'EPSG:4326'
                })
            }

            return ee.getInfo$(timeSeries.bandNames()).pipe(
                switchMap(dates => from(chunk(dates, MAX_STACK_SIZE))),
                mergeMap(exportChunk),
                tap(log.error)
            )
        }

        return ee.getInfo$(tiles.aggregate_array('system:index')).pipe(
            switchMap(tileIds => from(tileIds.map((tileId, tileIndex) => ({tileId, tileIndex})))),
            mergeMap(exportTile)
        )

        //
        //     . evaluate(tileIds => {
        //     tileIds
        //         .forEach(tileId => {
        //             const tile = tiles.filterMetadata('system:index', 'equals', tileId).first()
        //             const timeSeries = timeSeriesForFeature(tile, images)
        //             timeSeries.bandNames().evaluate(dates => {
        //                 chunk(dates, MAX_STACK_SIZE).forEach(dateChunk => {
        //                     const timeSeriesChunk = timeSeries.select(dateChunk)
        //                     const description = 'time_series_' + tileId + '_' + dateChunk[0] + '_' + dateChunk[dateChunk.length - 1]
        //                     exportTimeSeries(timeSeriesChunk, description)
        //                 })
        //             })
        //         })
        // })
        //
        // log.warn(collection.size().getInfo())
    }
}
