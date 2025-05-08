const {toGeometry} = require('#sepal/ee/aoi')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const {map, of, switchMap, zip} = require('rxjs')
const recipeRef = require('#sepal/ee/recipeRef')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee/ee')

const ccdc = (recipe, {selection: bands, visualizationType} = {selection: [], visiualizationType: 'CCDC'}) => {
    const justCount = visualizationType === 'COUNT'
    const geometry = toGeometry(recipe.model.aoi)
    const getImage$ = () => {
        const breakpointBands = recipe.model.sources.breakpointBands

        const count = collection => collection
            .select(0)
            .reduce(ee.Reducer.count())
            .rename('count')

        const ccdcImage = collection => {
            const {
                dateFormat, tmaskBands, minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
            } = recipe.model.ccdcOptions
            const ccdcBands = [
                ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
                ..._.uniq([...bands, ...breakpointBands]).map(band => ([
                    `${band}_coefs`,
                    `${band}_rmse`,
                    `${band}_magnitude`
                ]))
            ].flat()
            return ee.Image(
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
        }
        const bandsFromCollection = _.uniq([
            ...(justCount ? [] : bands),
            ...breakpointBands
        ])

        return getCollection$({recipe, bands: bandsFromCollection}).pipe(
            map(justCount ? count : ccdcImage)
        )
    }
    return {
        getImage$,
        getBands$: function () {
            if (justCount) {
                return of(['count'])
            }
            const dataSets = recipe.model.sources.dataSets
            const mosaicRecipe = !_.isEmpty(dataSets.SENTINEL_1)
                ? {
                    type: 'RADAR_MOSAIC',
                    model: {
                        options: recipe.model.options
                    }
                }
                : !_.isEmpty(dataSets.PLANET)
                    ? {
                        type: 'PLANET_MOSAIC',
                        model: {
                            aoi: recipe.model.aoi,
                            dates: {
                                fromDate: recipe.model.dates.startDate,
                                toDate: recipe.model.dates.endDate,
                            },
                            sources: {
                                source: dataSets.PLANET[0],
                                assets: recipe.model.sources.assets
                            },
                            compositeOptions: recipe.model.options
                        }
                    }
                    : {
                        type: 'MOSAIC',
                        model: {
                            sources: recipe.model.sources.dataSets,
                            compositeOptions: recipe.model.options
                        }
                    }
            const classificationRecipeId = recipe.model.sources.classification
            const classificationBands$ = classificationRecipeId
                ? recipeRef({id: classificationRecipeId}).getRecipe$().pipe(
                    switchMap(classificationRecipe => classificationRecipe.getBands$()),
                    map(bands => bands.filter(band => band !== 'class'))
                )
                : of([])
            const sourceBands$ = imageFactory(mosaicRecipe).getBands$()
            return zip(sourceBands$, classificationBands$).pipe(
                map(([sourceBands, classificationBands]) => [
                    ...[...sourceBands, ...classificationBands]
                        .filter(band => {
                            return !['dayOfYear', 'daysFromTarget'].includes(band)
                        })
                        .map(band => [
                            `${band}_coefs`,
                            `${band}_rmse`,
                            `${band}_magnitude`
                        ]).flat(),
                    ...['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']
                ])
            )
        },
        getGeometry$() {
            return of(geometry)
        },
        histogramMaxPixels: 1e3
    }
}

module.exports = ccdc
