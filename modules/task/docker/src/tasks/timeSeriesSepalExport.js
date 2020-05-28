const {toGeometry, toFeatureCollection} = require('sepal/ee/aoi')
const {allScenes} = require('sepal/ee/optical/collection')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const tile = require('sepal/ee/tile')
const {exportImageToSepal$} = require('root/ee/export')
const {mkdirSafe$} = require('root/rxjs/fileSystem')
const {concat, from, of} = require('rxjs')
const Path = require('path')
const {map, mergeMap, scan, switchMap, tap} = require('rxjs/operators')
const {swallow} = require('sepal/rxjs/operators')
const {terminal$} = require('sepal/terminal')
const {chunk} = require('sepal/utils/array')
const ee = require('ee')
const config = require('root/config')
const log = require('sepal/log').getLogger('task')

const TILE_DEGREES = 0.1
const MAX_CHUNK_SIZE = 1
const EE_EXPORT_SHARD_SIZE = 256
const EE_EXPORT_FILE_DIMENSIONS = 256

// const TILE_DEGREES = 2
// const MAX_CHUNK_SIZE = 100
// const EE_EXPORT_SHARD_SIZE = 256
// const EE_EXPORT_FILE_DIMENSIONS = 1024

module.exports = {
    submit$: (id, recipe) => {
        const preferredDownloadDir = `${config.homeDir}/downloads/${recipe.description}/`
        return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
            switchMap(downloadDir =>
                export$(downloadDir, recipe)
            )
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

    const exportTiles$ = tileIds => {
        const totalTiles = tileIds.length
        const tile$ = from(
            tileIds.map((tileId, tileIndex) =>
                ({tileId, tileIndex})
            )
        )
        return concat(
            of({totalTiles}),
            tile$.pipe(
                mergeMap(tile => exportTile$(tile), 1)
            )
        )
    }

    const exportTile$ = ({tileId, tileIndex}) => {
        return concat(
            of({tileIndex, chunks: 0}),
            chunk$({tileId, tileIndex}).pipe(
                switchMap(chunks => exportChunks$(chunks))
            ),
            postProcess$(Path.join(downloadDir, `${tileIndex}`))
        )
    }

    const chunk$ = ({tileId, tileIndex}) => {
        const tile = tiles.filterMetadata('system:index', 'equals', tileId).first()
        const timeSeries = timeSeriesForFeature(tile, images)
        let dates$ = ee.getInfo$(timeSeries.bandNames(), 'time-series band names')
        return dates$.pipe(
            map(dates =>
                chunk(dates.sort(), MAX_CHUNK_SIZE)
                    .map(dates => ({image: timeSeries.select(dates), tileIndex, dates}))
            )
        )
    }

    const exportChunks$ = chunks =>
        concat(
            of({totalChunks: chunks.length}),
            from(chunks).pipe(
                mergeMap(chunk => exportChunk$(chunk))
            )
        )

    const exportChunk$ = ({image, tileIndex, dates}) => {
        const firstDate = dates[0]
        const lastDate = dates[dates.length - 1]
        const dateDescription = `${firstDate}_${lastDate}`
        const chunkDescription = `${description}_${tileIndex}_${dateDescription}`
        const chunkDownloadDir = `${downloadDir}/${tileIndex}/chunk-${dateDescription}`
        return concat(
            exportImageToSepal$({
                folder: chunkDescription,
                image,
                description: chunkDescription,
                downloadDir: chunkDownloadDir,
                scale,
                crs: 'EPSG:4326',
                shardSize: EE_EXPORT_SHARD_SIZE,
                fileDimensions: EE_EXPORT_FILE_DIMENSIONS
            }).pipe(swallow()),
            of({completedChunk: true})
        )
    }

    const tileIds$ = ee.getInfo$(tiles.aggregate_array('system:index'), 'time-series image ids')

    return tileIds$.pipe(
        switchMap(tileIds => exportTiles$(tileIds)),
        tap(progress => log.trace(`time-series: ${JSON.stringify(progress)}`)),
        scan(
            (acc, progress) => {
                return ({
                    ...acc,
                    ...progress,
                    chunks: progress.chunks === undefined
                        ? acc.chunks + (progress.completedChunk ? 1 : 0)
                        : progress.chunks
                })
            },
            {tileIndex: 0, chunks: 0}
        ),
        map(toProgress)
    )
}

const postProcess$ = downloadDir =>
    terminal$('sepal-stack-time-series', [downloadDir])
        .pipe(swallow())

const toProgress = ({totalTiles = 0, tileIndex = 0, totalChunks = 0, chunks = 0}) => {
    const currentTilePercent = totalChunks ? Math.round(100 * chunks / totalChunks) : 0
    const currentTile = tileIndex + 1
    return {
        totalChunks,
        chunks,
        totalTiles,
        tileIndex,
        defaultMessage: `Exported ${currentTilePercent}% of tile ${currentTile} out of ${totalTiles}.`,
        messageKey: 'task.export.timeSeriesSepalExport.progress',
        messageArgs: {currentTilePercent, currentTile, totalTiles}
    }
}

