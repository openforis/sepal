const {toGeometry} = require('#sepal/ee/aoi')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const {of, map} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee')

const ccdc = (recipe, {selection: bands} = {selection: []}) => {
    const geometry = toGeometry(recipe.model.aoi)
    return {
        getImage$() {
            const {
                dateFormat, tmaskBands, minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
            } = recipe.model.ccdcOptions
            const breakpointBands = recipe.model.sources.breakpointBands
            const ccdcBands = [
                ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
                ..._.uniq([...bands, ...breakpointBands]).map(band => ([
                    `${band}_coefs`,
                    `${band}_rmse`,
                    `${band}_magnitude`
                ]))
            ].flat()
            return getCollection$({recipe, bands: _.uniq([...bands, ...breakpointBands])}).pipe(
                map(collection =>
                    ee.Image(
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
                    ))
            )
        },

        getBands$: function () {
            const mosaicRecipe = _.isEmpty(recipe.model.sources.dataSets.SENTINEL_1)
                ? {
                    type: 'MOSAIC',
                    model: {
                        sources: recipe.model.sources.dataSets,
                        compositeOptions: recipe.model.options
                    }
                }
                : {
                    type: 'RADAR_MOSAIC',
                    model: {
                        options: recipe.model.options
                    }
                }
            return imageFactory(mosaicRecipe).getBands$().pipe(
                map(sourceBands => {
                    return [
                        ...sourceBands
                            .filter(band => {
                                return !['dayOfYear', 'daysFromTarget'].includes(band)
                            })
                            .map(band => [
                                `${band}_coefs`,
                                `${band}_rmse`,
                                `${band}_magnitude`
                            ]).flat(),
                        'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'
                    ]
                })
            )
        },

        getVisParams$(_image) {
            throw new Error('CCDC segments cannot be visualized directly.')
        },

        getGeometry$() {
            return of(geometry)
        },

        histogramMaxPixels: 1e3
    }
}

module.exports = ccdc
