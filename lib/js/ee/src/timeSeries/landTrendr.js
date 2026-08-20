import {forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getCollection$} from '#sepal/ee/timeSeries/collection'

const OUTPUT_BANDS = ['yod', 'mag', 'dur', 'preval', 'postval']
const RGB_BANDS = ['red', 'green', 'blue']
const START_RGB_BANDS = ['startRed', 'startGreen', 'startBlue']
const END_RGB_BANDS = ['endRed', 'endGreen', 'endBlue']

// -1: index naturally DECREASES with disturbance (e.g. vegetation/moisture
//     indices), so it's flipped before fitting - a rise in the fitted series
//     then always means "disturbance", matching LT-GEE's indexFlipper
//     convention. nbr/ndvi/ndmi/evi are confirmed directly from
//     https://github.com/eMapR/LT-GEE/blob/master/LandTrendr.js; the rest are
//     inferred from each index's own formula/design intent (not LT-GEE's
//     own index set, so worth double-checking if results look off).
//  1: index naturally INCREASES with disturbance (built-up/bare-surface
//     indices) - already in the right orientation, no flip needed.
const DIRECTION_BY_INDEX = {
    ndvi: -1,
    ndmi: -1,
    ndwi: -1,
    mndwi: -1,
    ndfi: -1,
    evi: -1,
    evi2: -1,
    savi: -1,
    nbr: -1,
    mvi: -1,
    kndvi: -1,
    ui: 1,
    ndbi: 1,
    ibi: 1,
    bui: 1
}

// A calendar year with zero scenes (common in many AOIs before Landsat
// coverage became systematic, e.g. early-to-mid 1990s) makes
// ImageCollection.median() return a 0-band image instead of a masked
// image with the expected bands - which then blows up any subsequent
// per-band operation (multiply, rename, etc). Guard against that by
// falling back to an explicitly masked image with the right band names.
const compositeOrMasked = (collection, bandNames) => ee.Image(ee.Algorithms.If(
    collection.size().gt(0),
    collection.median(),
    ee.Image.constant(bandNames.map(() => 0)).rename(bandNames).selfMask()
))

const landTrendr = (recipe, _args = {selection: []}) => {
    const {startYear, endYear} = recipe.model.dates
    const index = recipe.model.sources.index
    const direction = DIRECTION_BY_INDEX[index] ?? 1

    const collectionForYear$ = (geometry, year, bands) => {
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

    const timeSeries$ = geometry => {
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
                    const yearCollection = collection
                        .filter(ee.Filter.calendarRange(year, year, 'year'))
                        .select(index)
                    return compositeOrMasked(yearCollection, [index])
                        .multiply(direction)
                        .rename(index)
                        .set('system:time_start', ee.Date.fromYMD(year, 7, 1).millis())
                })
            ).sort('system:time_start'))
        )
    }

    // The start- and end-year RGB composites, so the "before"/"after" imagery
    // can be viewed alongside the segmentation summary bands.
    const rgbComposites$ = geometry => forkJoin({
        start: collectionForYear$(geometry, startYear, RGB_BANDS).pipe(map(collection => compositeOrMasked(collection, RGB_BANDS))),
        end: collectionForYear$(geometry, endYear, RGB_BANDS).pipe(map(collection => compositeOrMasked(collection, RGB_BANDS)))
    }).pipe(
        map(({start, end}) => start.rename(START_RGB_BANDS).addBands(end.rename(END_RGB_BANDS)))
    )

    // Runs the built-in LandTrendr algorithm. Its 'LandTrendr' output band is
    // a per-pixel array with 4 rows (year, raw value, fitted value, isVertex)
    // and one column per input year - the standard LT-GEE array convention.
    const fit$ = geometry => timeSeries$(geometry).pipe(
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

    // Ranks segments by change magnitude according to changeDirection:
    // - LOSS: only segments that increased in the direction-normalized
    //   series (a real loss/disturbance) are eligible.
    // - GAIN: only segments that decreased (recovery/gain) are eligible.
    // - GREATEST (default): any segment is eligible, ranked by absolute
    //   magnitude regardless of direction.
    // Non-eligible segments are substituted with a sentinel rather than
    // filtered out (arrayMask would shrink the array to zero length for any
    // pixel with no eligible segment - common, since most pixels have no
    // disturbance - and arrayGet throws on an empty array instead of
    // returning masked/no-data).
    const rankChangeMagnitude = (magnitude, changeDirection) => {
        if (changeDirection === 'LOSS') {
            const isEligible = magnitude.gt(0)
            const hasEligible = isEligible.arrayReduce(ee.Reducer.max(), [1]).arrayGet([0, 0])
            // Image.where() doesn't accept an array-valued test image, so
            // substitute the sentinel with plain arithmetic instead.
            const ranking = magnitude.multiply(isEligible).add(isEligible.not().multiply(-1e9))
            return {hasEligible, ranking}
        }
        if (changeDirection === 'GAIN') {
            const isEligible = magnitude.lt(0)
            const hasEligible = isEligible.arrayReduce(ee.Reducer.max(), [1]).arrayGet([0, 0])
            const ranking = magnitude.abs().multiply(isEligible).add(isEligible.not().multiply(-1e9))
            return {hasEligible, ranking}
        }
        return {
            hasEligible: magnitude.arrayLength(1).gt(0),
            ranking: magnitude.abs()
        }
    }

    // Reduces the vertex/segment array down to a single change segment,
    // using the vertex-masking technique from the LT-GEE guide
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

        // A loss/disturbance shows as an increase, a gain/recovery as a
        // decrease, in the direction-normalized series.
        const magnitude = endValue.subtract(startValue)
        const duration = endYear.subtract(startYear)
        // 'year' comes from system:time_start, so it's a fractional year (our
        // composites are stamped to July 1st) - startYear is e.g. 2006.4986,
        // not 2006. LT-GEE's own getChangeMap truncates this the same way
        // (startYear.add(1).toInt16()) - without it, yod renders as a
        // fractional value instead of a whole calendar year.
        const yod = startYear.add(1).toInt16()

        // minMagnitude was added after some recipes were already saved, so
        // their persisted landTrendrOptions won't have it - default to 0
        // (no filtering) rather than letting `undefined` reach ee.Number.gt.
        const {changeDirection, minMagnitude = 0} = recipe.model.landTrendrOptions
        const {hasEligible, ranking} = rankChangeMagnitude(magnitude, changeDirection)

        const maxRanking = ranking.arrayReduce(ee.Reducer.max(), [1]).arrayGet([0, 0])
        const isGreatest = ranking.eq(maxRanking)

        const pick = (array, name) => array.arrayMask(isGreatest).arrayGet([0, 0]).rename(name)

        // `ranking` is already an absolute change-size measure in all three
        // changeDirection modes (see rankChangeMagnitude), so its max is the
        // winning segment's magnitude regardless of mode - comparing it
        // against minMagnitude here masks out pixels whose greatest change
        // is too small (or exactly 0, e.g. a perfectly flat/stable fit) to
        // be reported as a real disturbance.
        const isSignificant = maxRanking.gt(minMagnitude)

        // `magnitude` is already in original-scale units (endValue -
        // startValue in the flipped series cancels the flip out
        // algebraically) - only preval/postval need un-flipping.
        return pick(magnitude, 'mag')
            .addBands(pick(yod, 'yod'))
            .addBands(pick(duration, 'dur'))
            .addBands(pick(startValue, 'preval').multiply(direction))
            .addBands(pick(endValue, 'postval').multiply(direction))
            .updateMask(hasEligible.and(isSignificant))
    }

    return {
        getImage$: () => toGeometry$(recipe.model.aoi).pipe(
            switchMap(geometry => forkJoin({
                changeMap: fit$(geometry).pipe(map(ltResult => toChangeMap(ltResult))),
                rgb: rgbComposites$(geometry)
            }).pipe(
                map(({changeMap, rgb}) => changeMap
                    .addBands(rgb)
                    .select([...OUTPUT_BANDS, ...START_RGB_BANDS, ...END_RGB_BANDS])
                    .clip(geometry)
                )
            ))
        ),
        // Used only for pixel-level charting - exposes the raw year/value/vertex array,
        // un-flipping the raw/fitted rows back to original index units for display.
        getSegments$: () => toGeometry$(recipe.model.aoi).pipe(
            switchMap(geometry => fit$(geometry).pipe(
                map(ltResult => {
                    const lt = ee.Image(ltResult).select('LandTrendr')
                    const year = lt.arraySlice(0, 0, 1)
                    const raw = lt.arraySlice(0, 1, 2).multiply(direction)
                    const fitted = lt.arraySlice(0, 2, 3).multiply(direction)
                    const isVertex = lt.arraySlice(0, 3, 4)
                    const unflipped = year.arrayCat(raw, 0).arrayCat(fitted, 0).arrayCat(isVertex, 0).rename('LandTrendr')
                    return unflipped.addBands(ee.Image(ltResult).select('rmse'))
                })
            ))
        ),
        getBands$: () => of([...OUTPUT_BANDS, ...START_RGB_BANDS, ...END_RGB_BANDS]),
        getGeometry$: () => toGeometry$(recipe.model.aoi)
    }
}

export default landTrendr
