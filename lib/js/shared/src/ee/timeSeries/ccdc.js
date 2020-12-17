const {toGeometry} = require('sepal/ee/aoi')
const {getCollection$} = require('sepal/ee/timeSeries/collection')
const {of} = require('rx')
const {map} = require('rx/operators')
const _ = require('lodash')
const ee = require('ee')

const ccdc = (recipe, {selection: bands} = {selection: []}) => {
    const geometry = toGeometry(recipe.model.aoi)
    return {
        getImage$() {
            const {
                dateFormat, tmaskBands, minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
            } = recipe.model.ccdcOptions
            const ccdcBands = [
                ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
                ...bands.map(band => ([
                    `${band}_coefs`,
                    `${band}_rmse`,
                    `${band}_magnitude`
                ]))
            ].flat()
            const breakpointBands = recipe.model.sources.breakpointBands
            return getCollection$({recipe, bands: _.uniq([...bands, ...breakpointBands])}).pipe(
                map(collection => ee.Image(
                    ee.Algorithms.TemporalSegmentation.Ccdc({
                        collection,
                        breakpointBands,
                        minObservations,
                        chiSquareProbability,
                        minNumOfYearsScaler,
                        dateFormat,
                        tmaskBands,
                        lambda,
                        maxIterations
                    }).select(ccdcBands).clip(geometry)
                ))
            )
        },

        getVisParams$(_image) {
            throw new Error('CCDC segments cannot be visualized directly.')
        },

        getGeometry$() {
            return of(geometry)
        }
    }
}

module.exports = ccdc
