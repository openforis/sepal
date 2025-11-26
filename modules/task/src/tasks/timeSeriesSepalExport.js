const {toFeatureCollection} = require('#sepal/ee/aoi')
const {hasImagery: hasOpticalImagery} = require('#sepal/ee/optical/collection')
const {hasImagery: hasRadarImagery} = require('#sepal/ee/radar/collection')
const {hasImagery: hasPlanetImagery} = require('#sepal/ee/planet/collection')
const tile = require('#sepal/ee/tile')
const {exportImageToSepal$} = require('../jobs/export/toSepal')
const {mkdirSafe$} = require('#task/rxjs/fileSystem')
const {concat, forkJoin, from, of, map, mergeMap, scan, switchMap, tap} = require('rxjs')
const {swallow} = require('#sepal/rxjs')
const Path = require('path')
const {terminal$} = require('#sepal/terminal')
const {sequence} = require('#sepal/utils/array')
const moment = require('moment')
const ee = require('#sepal/ee/ee')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('task')
const {setWorkloadTag} = require('./workloadTag')

const DATE_DELTA = 3
const DATE_DELTA_UNIT = 'months'

module.exports = {
    submit$: (taskId, {description, image: {workspacePath, filenamePrefix, ...retrieveOptions}}) => {
        setWorkloadTag(retrieveOptions.recipe)
        return getCurrentContext$().pipe(
            switchMap(({config}) => {
                const exportPrefix = filenamePrefix || description
                const preferredDownloadDir = workspacePath
                    ? `${config.homeDir}/${workspacePath}/`
                    : `${config.homeDir}/downloads/${description}/`
                return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
                    switchMap(downloadDir => export$(taskId, {description: exportPrefix, downloadDir, ...retrieveOptions})
                    )
                )
            })
        )
    }
}

const export$ = (taskId, {
    downloadDir,
    description,
    recipe,
    indicator,
    scale,
    tileSize,
    shardSize,
    fileDimensions,
    crs,
    crsTransform
}) => {
    const aoi = recipe.model.aoi
    const sources = recipe.model.sources
    const dataSets = sources.dataSets
    const {startDate, endDate} = recipe.model.dates
    const reflectance = recipe.model.options.corrections.includes('SR') ? 'SR' : 'TOA'
    const tiles = tile(toFeatureCollection(aoi), tileSize) // synchronous EE

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
        const from = moment(startDate)
        const to = moment(endDate)
        const duration = moment(to).subtract(1, 'day').diff(from, DATE_DELTA_UNIT)
        const dateOffsets = sequence(0, duration, DATE_DELTA)
        const chunks$ = dateOffsets.map(dateOffset => {
            const start = moment(from).add(dateOffset, DATE_DELTA_UNIT)
            const startString = start.format('YYYY-MM-DD')
            const end = moment.min(moment(start).add(DATE_DELTA, DATE_DELTA_UNIT), to)
            const endString = end.format('YYYY-MM-DD')
            const dateRange = `${startString}_${endString}`
            return hasImagery$(
                tile.geometry(),
                ee.Date(startString),
                ee.Date(endString)
            ).pipe(
                switchMap(notEmpty => {
                    if (notEmpty) {
                        return createTimeSeries$(tile, startString, endString).pipe(
                            map(timeSeries =>
                                ({tileIndex, timeSeries, dateRange, notEmpty})
                            )
                        )
                    } else {
                        return of({tileIndex, dateRange, notEmpty})
                    }
                })
            )
        })
        return forkJoin(chunks$)
    }

    const isRadar = () => _.isEqual(Object.values(dataSets).flat(), ['SENTINEL_1'])
    const isOptical = () => Object.keys(dataSets).find(type => ['LANDSAT', 'SENTINEL_2'].includes(type))

    const createTimeSeries$ = (feature, startDate, endDate) => {
        const images$ = getCollection$({recipe, bands: [indicator], startDate, endDate})
        return images$.pipe(
            map(images => {
                images = images.select(indicator)
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
            })
        )
    }

    const hasImagery$ = (geometry, startDate, endDate) =>
        ee.getInfo$(
            isRadar()
                ? hasRadarImagery({geometry, startDate, endDate, orbits: recipe.model.options.orbits})
                : isOptical()
                    ? hasOpticalImagery({dataSets: extractDataSets(dataSets), reflectance, geometry, startDate, endDate})
                    : hasPlanetImagery({sources: {...sources, source: Object.values(sources.dataSets).flat()[0]}, geometry, startDate, endDate}),
            'check if date range has imagery'
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
        const export$ = exportImageToSepal$(taskId, {
            image: timeSeries,
            folder: chunkDescription,
            description: chunkDescription,
            downloadDir: chunkDownloadDir,
            scale,
            crs,
            crsTransform,
            shardSize,
            fileDimensions
        }).pipe(swallow())
        return concat(
            export$,
            of({completedChunk: true})
        )
    }

    const tileIds$ = ee.getInfo$(tiles.aggregate_array('system:index'), `time-series image ids ${description}`)

    return tileIds$.pipe(
        switchMap(tileIds => exportTiles$(tileIds)),
        tap(progress => log.trace(() => `time-series: ${JSON.stringify(progress)}`)),
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
