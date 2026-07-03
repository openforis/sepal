import {forkJoin, map, of} from 'rxjs'

import {toGeometry} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'

const OUTPUT_BANDS = ['yod', 'mag', 'dur', 'preval', 'postval']
const RGB_BANDS = ['red', 'green', 'blue']
const START_RGB_BANDS = ['startRed', 'startGreen', 'startBlue']
const END_RGB_BANDS = ['endRed', 'endGreen', 'endBlue']

const landTrendr = (recipe, _args = {selection: []}) => {
    const geometry = toGeometry(recipe.model.aoi)
    const {startYear, endYear} = recipe.model.dates
    const index = recipe.model.sources.index

    const collectionForYear$ = (year, bands) => {
        const collectionRecipe = {
            model: {
                dates: {
                    startDate: `${year}-01-01`,
                    endDate: `${year + 1}-01-01`
                },
                sources: recipe.model.sources,
                options: recipe.model.options
            }
        }
        return getCollection$({recipe: collectionRecipe, geometry, bands})
    }

    const timeSeries$ = () => {
        const collectionRecipe = {
            model: {
                dates: {
                    startDate: `${startYear}-01-01`,
                    endDate: `${endYear + 1}-01-01`
                },
                sources: recipe.model.sources,
                options: recipe.model.options
            }
        }
        return getCollection$({recipe: collectionRecipe, geometry, bands: [index]}).pipe(
            map(collection => ee.ImageCollection(
                ee.List.sequence(startYear, endYear).map(y => {
                    const year = ee.Number(y)
                    return collection
                        .filter(ee.Filter.calendarRange(year, year, 'year'))
                        .select(index)
                        .median()
                        .rename(index)
                        .set('system:time_start', ee.Date.fromYMD(year, 7, 1).millis())
                })
            ).sort('system:time_start'))
        )
    }

    // The start- and end-year RGB composites, so the "before"/"after" imagery
    // can be viewed alongside the segmentation summary bands.
    const rgbComposites$ = () => forkJoin({
        start: collectionForYear$(startYear, RGB_BANDS).pipe(map(collection => collection.median())),
        end: collectionForYear$(endYear, RGB_BANDS).pipe(map(collection => collection.median()))
    }).pipe(
        map(({start, end}) => start.rename(START_RGB_BANDS).addBands(end.rename(END_RGB_BANDS)))
    )

    // Runs the built-in LandTrendr algorithm. Its 'LandTrendr' output band is
    // a per-pixel array with 4 rows (year, raw value, fitted value, isVertex)
    // and one column per input year - the standard LT-GEE array convention.
    const fit$ = () => timeSeries$().pipe(
        map(timeSeries => {
            const {
                maxSegments, spikeThreshold, vertexCountOvershoot, preventOneYearRecovery,
                recoveryThreshold, pvalThreshold, bestModelProportion, minObservationsNeeded
            } = recipe.model.landTrendrOptions
            return ee.Algorithms.TemporalSegmentation.LandTrendr({
                timeSeries,
                maxSegments,
                spikeThreshold,
                vertexCountOvershoot,
                preventOneYearRecovery,
                recoveryThreshold,
                pvalThreshold,
                bestModelProportion,
                minObservationsNeeded
            })
        })
    )

    // Reduces the vertex/segment array down to the single greatest-disturbance
    // segment (largest absolute change between consecutive vertices), using
    // the vertex-masking technique from the LT-GEE guide
    // (https://emapr.github.io/LT-GEE/working-with-outputs.html).
    const toChangeMap = ltResult => {
        const lt = ee.Image(ltResult).select('LandTrendr')
        const vertexMask = lt.arraySlice(0, 3, 4)
        const vertices = lt.arrayMask(vertexMask)

        const left = vertices.arraySlice(1, 0, -1)
        const right = vertices.arraySlice(1, 1)

        const startYear = left.arraySlice(0, 0, 1)
        const endYear = right.arraySlice(0, 0, 1)
        const startValue = left.arraySlice(0, 2, 3)
        const endValue = right.arraySlice(0, 2, 3)

        const magnitude = startValue.subtract(endValue)
        const duration = endYear.subtract(startYear)

        const segmentCount = magnitude.arrayLength(1)

        const absMagnitude = magnitude.abs()
        const maxAbsMagnitude = absMagnitude.arrayReduce(ee.Reducer.max(), [1]).arrayGet([0, 0])
        const isGreatest = absMagnitude.eq(maxAbsMagnitude)

        const pick = (array, name) => array.arrayMask(isGreatest).arrayGet([0, 0]).rename(name)

        return pick(magnitude, 'mag')
            .addBands(pick(endYear, 'yod'))
            .addBands(pick(duration, 'dur'))
            .addBands(pick(startValue, 'preval'))
            .addBands(pick(endValue, 'postval'))
            .updateMask(segmentCount.gt(0))
    }

    return {
        getImage$: () => forkJoin({
            changeMap: fit$().pipe(map(ltResult => toChangeMap(ltResult))),
            rgb: rgbComposites$()
        }).pipe(
            map(({changeMap, rgb}) => changeMap
                .addBands(rgb)
                .select([...OUTPUT_BANDS, ...START_RGB_BANDS, ...END_RGB_BANDS])
                .clip(geometry)
            )
        ),
        // Used only for pixel-level charting - exposes the raw year/value/vertex array.
        getSegments$: () => fit$().pipe(
            map(ltResult => ee.Image(ltResult).select(['LandTrendr', 'rmse']))
        ),
        getBands$: () => of([...OUTPUT_BANDS, ...START_RGB_BANDS, ...END_RGB_BANDS]),
        getGeometry$: () => of(geometry)
    }
}

export default landTrendr
