const {toGeometry, toFeatureCollection} = require('sepal/ee/aoi')
const {allScenes} = require('sepal/ee/optical/collection')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const tile = require('sepal/ee/tile')
const {exportImageToSepal$} = require('root/ee/export')
const {mkdirSafe$} = require('root/rxjs/fileSystem')
const {concat, from, of} = require('rxjs')
const Path = require('path')
const {mergeMap, switchMap, tap} = require('rxjs/operators')
const {terminal$} = require('sepal/terminal')
const {chunk} = require('sepal/utils/array')
const ee = require('ee')
const config = require('root/config')

const TILE_DEGREES = 0.1
const MAX_STACK_SIZE = 5
const EE_EXPORT_SHARD_SIZE = 256
const EE_EXPORT_FILE_DIMENSIONS = 256


// const TILE_DEGREES = 2
// const MAX_STACK_SIZE = 100
// const EE_EXPORT_SHARD_SIZE = 256
// const EE_EXPORT_FILE_DIMENSIONS = 1024

module.exports = {
    submit$: (id, recipe) => {
        const preferredDownloadDir = `${config.homeDir}/downloads/${recipe.description}/`
        return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
            switchMap(downloadDir =>
                concat(
                    export$(downloadDir, recipe),
                    postProcess$(downloadDir)
                ))
        )
    },
}

const export$ = (downloadDir, recipe) => {
    const {
        description, aoi, dataSets, surfaceReflectance, cloudMasking,
        cloudBuffer, snowMasking, calibrate, brdfCorrect, fromDate, toDate, indicator,
        scale
    } = recipe
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
            const dateDescription = `${firstDate}_${lastDate}`
            const chunkDescription = `${description}_${tileIndex}_${dateDescription}`
            const chunkDownloadDir = `${downloadDir}/${tileIndex}/chunk-${dateDescription}`
            return exportImageToSepal$({
                image,
                description: chunkDescription,
                downloadDir: chunkDownloadDir,
                scale,
                crs: 'EPSG:4326',
                shardSize: EE_EXPORT_SHARD_SIZE,
                fileDimensions: EE_EXPORT_FILE_DIMENSIONS
            })
        }

        return ee.getInfo$(timeSeries.bandNames(), 'time-series band names').pipe(
            switchMap(dates => from(chunk(dates.sort(), MAX_STACK_SIZE))),
            mergeMap(exportChunk)
        )
    }

    return ee.getInfo$(tiles.aggregate_array('system:index'), 'time-series image ids').pipe(
        switchMap(tileIds => from(tileIds.map((tileId, tileIndex) => ({tileId, tileIndex})))),
        mergeMap(exportTile)
    )
}

const postProcess$ = downloadDir =>
    terminal$('sepal-stack-time-series', [Path.join(downloadDir, '/*')])


