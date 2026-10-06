import _ from 'lodash'
import {map, switchMap} from 'rxjs'

import {toFeatureCollection$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {hasImagery as hasOpticalImagery} from '#sepal/ee/optical/collection'
import {hasImagery as hasPlanetImagery} from '#sepal/ee/planet/collection'
import {hasImagery as hasRadarImagery} from '#sepal/ee/radar/collection'
import tile from '#sepal/ee/tile'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {planetSource} from '#sepal/recipe/collectionType'

import {startImageToWorkspaceExport$} from './toWorkspace.js'

export const timeSeriesTiles$ = ({image: {recipe, tileSize}}) =>
    tiling$(recipe, tileSize).pipe(
        switchMap(({tiles}) => ee.getInfo$(tiles.aggregate_array('system:index'), 'time-series tile ids')),
        map(tileIds => ({tileIds}))
    )

// One computation for the whole tile, not one per date range.
export const timeSeriesChunks$ = ({image: {recipe, tileSize}, tileId, dateRanges}) =>
    tiling$(recipe, tileSize).pipe(
        switchMap(({tiles}) => {
            const geometry = tileFeature(tiles, tileId).geometry()
            return ee.getInfo$(
                ee.List(dateRanges.map(({startDate, endDate}) => hasImagery(recipe, geometry, ee.Date(startDate), ee.Date(endDate)))),
                'time-series date ranges with imagery'
            )
        }),
        map(flags => ({dateRanges: dateRanges.filter((_range, index) => flags[index])}))
    )

export const startTimeSeriesChunkExport$ = ({description, image: {recipe, indicator, tileSize, filenamePrefix, scale, crs, crsTransform, shardSize, fileDimensions}, tileId, tileIndex, startDate, endDate}, {sepalUser}) =>
    tiling$(recipe, tileSize).pipe(
        switchMap(({aoiGeometry, tiles}) => timeSeries$({recipe, indicator, aoiGeometry, feature: tileFeature(tiles, tileId), startDate, endDate})),
        switchMap(timeSeries => {
            const chunkDescription = `${filenamePrefix || description}_${tileIndex}_${startDate}_${endDate}`
            return startImageToWorkspaceExport$({
                image: timeSeries, folder: chunkDescription, description: chunkDescription, scale, crs, crsTransform, shardSize, fileDimensions
            }, {sepalUser})
        })
    )

// The aoi is resolved before any of the export graph is built: an ASSET or RECIPE aoi is a descriptor whose
// geometry only Earth Engine can supply, and tile() needs the real collection. The whole aoi filters the source
// collection; each tile's own geometry is responsible for imagery checks and final clipping.
const tiling$ = (recipe, tileSize) =>
    toFeatureCollection$(recipe.model.aoi).pipe(
        map(featureCollection => ({aoiGeometry: featureCollection.geometry(), tiles: tile(featureCollection, tileSize)}))
    )

const tileFeature = (tiles, tileId) =>
    tiles.filterMetadata('system:index', 'equals', tileId).first()

const timeSeries$ = ({recipe, indicator, aoiGeometry, feature, startDate, endDate}) =>
    getCollection$({
        recipe,
        geometry: aoiGeometry,
        bands: [indicator],
        startDate,
        endDate
    }).pipe(
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

const hasImagery = (recipe, geometry, startDate, endDate) => {
    const sources = recipe.model.sources
    const dataSets = sources.dataSets
    const reflectance = recipe.model.options.corrections.includes('SR') ? 'SR' : 'TOA'
    return isRadar(dataSets)
        ? hasRadarImagery({geometry, startDate, endDate, orbits: recipe.model.options.orbits})
        : isOptical(dataSets)
            ? hasOpticalImagery({dataSets: extractDataSets(dataSets), reflectance, geometry, startDate, endDate})
            : hasPlanetImagery({sources: {...sources, source: planetSource(sources.dataSets)}, geometry, startDate, endDate})
}

const isRadar = dataSets => _.isEqual(Object.values(dataSets).flat(), ['SENTINEL_1'])

const isOptical = dataSets => Object.keys(dataSets).find(type => ['LANDSAT', 'SENTINEL_2'].includes(type))

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
