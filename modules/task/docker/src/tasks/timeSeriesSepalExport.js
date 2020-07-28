const {toGeometry, toFeatureCollection} = require('sepal/ee/aoi')
const {allScenes: createOpticalCollection, hasImagery: hasOpticalImagery} = require('sepal/ee/optical/collection')
const {createCollection: createRadarCollection, hasImagery: hasRadarImagery} = require('sepal/ee/radar/collection')
const {calculateIndex} = require('sepal/ee/optical/indexes')
const tile = require('sepal/ee/tile')
const {exportImageToSepal$} = require('../jobs/export/toSepal')
const {mkdirSafe$} = require('root/rxjs/fileSystem')
const {concat, forkJoin, from, of} = require('rx')
const Path = require('path')
const {map, mergeMap, scan, switchMap, tap} = require('rx/operators')
const {swallow} = require('sepal/rxjs/operators')
const {terminal$} = require('sepal/terminal')
const {sequence} = require('sepal/utils/array')
const moment = require('moment')
const ee = require('ee')
const {getCurrentContext$} = require('root/jobs/service/context')
const log = require('sepal/log').getLogger('task')

const TILE_DEGREES = 2
const EE_EXPORT_SHARD_SIZE = 256
const EE_EXPORT_FILE_DIMENSIONS = 2048
const DATE_DELTA = 3
const DATE_DELTA_UNIT = 'months'

module.exports = {
    submit$: (id, recipe) =>
        getCurrentContext$().pipe(
            switchMap(({config}) => {
                const preferredDownloadDir = `${config.homeDir}/downloads/${recipe.description}/`
                return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
                    switchMap(downloadDir =>
                        export$(downloadDir, recipe)
                    )
                )
            })
        )
}

const export$ = (downloadDir, recipe) => {
    const {
        description, aoi, dataSets, fromDate, toDate, indicator, scale,
        surfaceReflectance, cloudMasking, cloudBuffer, snowMasking, calibrate, brdfCorrect, // Optical
        orbits, geometricCorrection, speckleFilter, outlierRemoval // Radar
    } = recipe

    const geometry = toGeometry(aoi) // synchronous EE
    const reflectance = surfaceReflectance ? 'SR' : 'TOA'

    const tiles = tile(toFeatureCollection(aoi), TILE_DEGREES) // synchronous EE

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
    const exportTile$ = ({tileId, tileIndex}) =>
        concat(
            of({tileIndex, chunks: 0}),
            exportChunks$(createChunks$({tileId, tileIndex})),
            postProcess$(Path.join(downloadDir, `${tileIndex}`))
        )

    const createChunks$ = ({tileId, tileIndex}) => {
        const tile = tiles.filterMetadata('system:index', 'equals', tileId).first()
        const from = moment(fromDate)
        const to = moment(toDate)
        const duration = moment(to).subtract(1, 'day').diff(from, DATE_DELTA_UNIT)
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

    const opticalImages = (geometry, startDate, endDate) =>
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
                seasonStart: startDate.format('YYYY-MM-DD'),
                seasonEnd: endDate.format('YYYY-MM-DD')
            }
        }).map(image =>
            calculateIndex(image, indicator)
                .set('date', image.date().format('yyyy-MM-dd'))
        )


    const radarImages = (geometry, startDate, endDate) =>
        createRadarCollection({
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            targetDate: startDate.format('YYYY-MM-DD'),
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

    const createTimeSeries = (feature, startDate, endDate) => {
        const images = isRadar()
            ? radarImages(feature.geometry(), startDate, endDate)
            : opticalImages(feature.geometry(), startDate, endDate)
        const distinctDateImages = images.distinct('date')
        const timeSeries = ee.ImageCollection(
            ee.Join.saveAll('images')
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
        ee.getInfo$(
            isRadar()
                ? hasRadarImagery({geometry, startDate, endDate})
                : hasOpticalImagery({dataSets: extractDataSets(dataSets), reflectance, geometry, startDate, endDate}),
            `check if date range ${startDate}-${endDate} has imagery (${description})`
        )

    const exportChunks$ = chunks$ =>
        chunks$.pipe(
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

    const exportChunk$ = ({tileIndex, timeSeries, dateRange}) => {
        const chunkDescription = `${description}_${tileIndex}_${dateRange}`
        const chunkDownloadDir = `${downloadDir}/${tileIndex}/chunk-${dateRange}`
        const export$ = exportImageToSepal$({
            image: timeSeries,
            folder: chunkDescription,
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

    const tileIds$ = ee.getInfo$(tiles.aggregate_array('system:index'), `time-series image ids ${description}`)

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
        .pipe(
            tap(({stream, value}) => {
                if (value)
                    stream === 'stdout' ? log.info(value) : log.warn(value)
            }),
            swallow()
        )

const toProgress = ({totalTiles = 0, tileIndex = 0, totalChunks = 0, chunks = 0}) => {
    const currentTilePercent = totalChunks ? Math.round(100 * chunks / totalChunks) : 0
    const currentTile = tileIndex + 1
    return currentTilePercent < 100
        ? {
            totalChunks,
            chunks,
            totalTiles,
            tileIndex,
            defaultMessage: `Exported ${currentTilePercent}% of tile ${currentTile} out of ${totalTiles}.`,
            messageKey: 'tasks.retrieve.time_series_to_sepal.progress',
            messageArgs: {currentTilePercent, currentTile, totalTiles}
        }
        : {
            totalChunks,
            chunks,
            totalTiles,
            tileIndex,
            defaultMessage: `Assembling tile ${currentTile} out of ${totalTiles}...`,
            messageKey: 'tasks.retrieve.time_series_to_sepal.assembling',
            messageArgs: {currentTile, totalTiles}
        }
}

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
