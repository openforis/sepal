const {toGeometry, toFeatureCollection} = require('sepal/ee/aoi')
const {allScenes, hasImagery} = require('sepal/ee/optical/collection')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const tile = require('sepal/ee/tile')
const {exportImageToSepal$} = require('root/ee/export')
const {mkdirSafe$} = require('root/rxjs/fileSystem')
const {concat, forkJoin, from, of} = require('rxjs')
const Path = require('path')
const {map, mergeMap, scan, switchMap, tap} = require('rxjs/operators')
const {swallow} = require('sepal/rxjs/operators')
const {terminal$} = require('sepal/terminal')
const {sequence} = require('sepal/utils/array')
const moment = require('moment')
const ee = require('ee')
const config = require('root/config')
const log = require('sepal/log').getLogger('task')

const TILE_DEGREES = 2
const EE_EXPORT_SHARD_SIZE = 256
const EE_EXPORT_FILE_DIMENSIONS = 1024
const DATE_DELTA = 2
const DATE_DELTA_UNIT = 'months'

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

    const tiles = tile(toFeatureCollection(aoi), TILE_DEGREES)

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
            exportChunks$(createChunks$({tileId, tileIndex})),
            postProcess$(Path.join(downloadDir, `${tileIndex}`))
        )
    }

    const createChunks$ = ({tileId, tileIndex}) => {
        const tile = tiles.filterMetadata('system:index', 'equals', tileId).first()
        const from = moment(fromDate)
        const to = moment(toDate)
        const duration = to.diff(from, DATE_DELTA_UNIT)
        const dateOffsets = sequence(0, duration, DATE_DELTA)
        const chunks$ = dateOffsets.map(dateOffset => {
            const start = moment(from).add(dateOffset, DATE_DELTA_UNIT)
            const end = moment.min(moment(start).add(DATE_DELTA, DATE_DELTA_UNIT), to)
            const timeSeries = createTimeSeries(tile, start, end)
            const dateRange = `${start.format('YYYY-MM-DD')}_${end.format('YYYY-MM-DD')}`
            const notEmpty$ = hasImagery$(
                ee.Date(start.format('YYYY-MM-DD')),
                ee.Date(end.format('YYYY-MM-DD'))
            )
            return notEmpty$.pipe(
                map(notEmpty => ({tileIndex, timeSeries, dateRange, notEmpty}))
            )
        })
        return forkJoin(chunks$)
    }

    const createTimeSeries = (feature, startDate, endDate) => {
        const images = allScenes({
            geometry: feature.geometry(),
            dataSets,
            reflectance,
            filters: [],
            cloudMasking,
            cloudBuffer,
            snowMasking,
            panSharpen: false,
            calibrate,
            brdfCorrect,
            dates: {
                seasonStart: startDate.format('YYYY-MM-DD'),
                seasonEnd: endDate.format('YYYY-MM-DD')
            }
        }).map(image =>
            calculateIndex(image, indicator)
                .set('date', image.date().format('yyyy-MM-dd'))
        )
        const distinctDateImages = images.distinct('date')
        const timeSeries = ee.ImageCollection(ee.Join.saveAll('images')
            .apply({
                primary: distinctDateImages,
                secondary: images,
                condition: ee.Filter.equals({
                    leftField: 'date',
                    rightField: 'date'
                })
            })
            .map(image => ee.ImageCollection(ee.List(image.get('images')))
                .median()
                .rename(image.getString('date'))
            ))
            .toBands()
            .regexpRename('.*(.{10})', '$1')
            .clip(feature.geometry())
        return timeSeries.select(timeSeries.bandNames().sort())
    }

    const hasImagery$ = (startDate, endDate) =>
        ee.getInfo$(hasImagery({dataSets, reflectance, geometry, startDate, endDate}), 'check if date range has imagery')

    const exportChunks$ = chunks$ => {
        return chunks$.pipe(
            switchMap(chunks => {
                const nonEmptyChunks = chunks.filter(({notEmpty}) => notEmpty)
                const totalChunks = nonEmptyChunks.length
                return concat(
                        of({totalChunks}),
                        from(nonEmptyChunks).pipe(
                            mergeMap(chunk => exportChunk$(chunk))
                        )
                    )
            })
        )
    }


    const exportChunk$ = ({tileIndex, timeSeries, dateRange}) => {
        const chunkDescription = `${description}_${tileIndex}_${dateRange}`
        const chunkDownloadDir = `${downloadDir}/${tileIndex}/chunk-${dateRange}`
        const export$ = exportImageToSepal$({
            folder: chunkDescription,
            image: timeSeries,
            description: chunkDescription,
            downloadDir: chunkDownloadDir,
            scale,
            crs: 'EPSG:4326',
            shardSize: EE_EXPORT_SHARD_SIZE,
            fileDimensions: EE_EXPORT_FILE_DIMENSIONS
        }).pipe(swallow())
        return concat(
            export$,
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
        messageKey: 'tasks.retrieve.time_series_to_sepal.progress',
        messageArgs: {currentTilePercent, currentTile, totalTiles}
    }
}

