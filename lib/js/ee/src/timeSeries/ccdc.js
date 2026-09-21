import _ from 'lodash'
import {map, of, switchMap, zip} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {contributingCollection} from '#sepal/ee/planet/collection'
import {contributingDailyBands$} from '#sepal/ee/planet/daily'
import recipeRef from '#sepal/ee/recipeRef'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {collectionType, PLANET, planetSource} from '#sepal/recipe/collectionType'
import {ccdcMeasures, ccdcOutputBands, measuresFor} from '#sepal/recipe/type/ccdc'

// `selection` names the measures to fit, as internal consumers of segments ask for them. `outputBands` names the
// physical bands an operation wants back instead: they are translated into the measures that construct them, and
// exactly those bands are returned.
const ccdc = (recipe, {selection = [], outputBands, visualizationType} = {}) => {
    const bands = outputBands?.length ? measuresFor(outputBands) : selection
    const justCount = visualizationType === 'COUNT'
    const getImage$ = () => {
        const breakpointBands = recipe.model.sources.breakpointBands

        const count = collection => collection
            .select(0)
            .reduce(ee.Reducer.count())
            .rename('count')

        const ccdcImage = geometry => collection => {
            const {
                dateFormat, tmaskBands, minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
            } = recipe.model.ccdcOptions
            const ccdcBands = ccdcOutputBands(_.uniq([...bands, ...breakpointBands]))
            const segments = ee.Image(
                ee.Algorithms.TemporalSegmentation.Ccdc({
                    collection,
                    breakpointBands,
                    minObservations,
                    chiSquareProbability,
                    minNumOfYearsScaler,
                    dateFormat,
                    tmaskBands: tmaskBands && tmaskBands.length === 2 ? tmaskBands : undefined,
                    lambda,
                    maxIterations
                }).select(ccdcBands).clip(geometry)
            )
            return outputBands?.length ? segments.select(outputBands) : segments
        }
        const bandsFromCollection = _.uniq([
            ...(justCount ? [] : bands),
            ...breakpointBands
        ])

        return toGeometry$(recipe.model.aoi).pipe(
            switchMap(geometry =>
                getCollection$({recipe, geometry, bands: bandsFromCollection}).pipe(
                    map(justCount ? count : ccdcImage(geometry))
                )
            )
        )
    }
    return {
        getImage$,
        // What this recipe can be asked for, rather than what it builds when asked for nothing. Two facts have
        // to be read - a classification's own bands, and the schema of Planet Daily imagery; the rest of the
        // catalogue follows from the model.
        getBands$: function () {
            if (justCount) {
                return of(['count'])
            }
            return zip(
                classificationBands$(recipe.model.sources.classification),
                nativeBands$(recipe.model)
            ).pipe(
                map(([classificationBands, nativeBands]) =>
                    ccdcOutputBands(ccdcMeasures({model: recipe.model, classificationBands, nativeBands})))
            )
        },
        getGeometry$() {
            return toGeometry$(recipe.model.aoi)
        },
        histogramMaxPixels: 1e3
    }
}

// Only Planet Daily is read: whether it carries four bands or eight depends on the imagery in the configured
// assets, which the model does not state. Every other collection's bands follow from the model alone.
//
// What contributes is what execution would process, not what an asset happens to begin with: the same merge
// and the same area and date filtering, stopping short of the processing itself. The area of interest is
// resolved only on this branch, since no other one is filtered by it here.
const nativeBands$ = model => {
    const sources = dailyPlanetSources(model)
    if (!sources) {
        return of(null)
    }
    // An unconfigured asset list is a collection with nothing in it, which is what an empty list says.
    return sources.assets?.length
        ? toGeometry$(model.aoi).pipe(
            switchMap(geometry => contributingDailyBands$(contributingCollection({
                geometry,
                startDate: model.dates.startDate,
                endDate: model.dates.endDate,
                sources
            })))
        )
        : of([])
}

// The sources planetImages would build a Daily collection from, or nothing when this is not one.
const dailyPlanetSources = model => {
    const sources = model.sources
    const source = planetSource(sources?.dataSets)
    return collectionType(sources?.dataSets) === PLANET && source === 'DAILY'
        ? {...sources, source}
        : null
}

const classificationBands$ = classificationRecipeId => classificationRecipeId
    ? recipeRef({id: classificationRecipeId}).getRecipe$().pipe(
        switchMap(classificationRecipe => classificationRecipe.getBands$())
    )
    : of([])

export default ccdc
