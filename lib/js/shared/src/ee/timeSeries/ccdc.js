const {toGeometry} = require('sepal/ee/aoi')
const {of} = require('rx')
const ee = require('ee')


module.exports = {
    getSegments$: (
        {
            collection, aoi, bands,
            breakpointBands, minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations
        }) => {
        const geometry = toGeometry(aoi)

        const ccdcBands = [
            ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'],
            ...bands.map(band => ([
                `${band}_coefs`,
                `${band}_rmse`,
                `${band}_magnitude`
            ]))
        ].flat()
        const executeCCDC = collection => {
            return ee.Algorithms.TemporalSegmentation.Ccdc({
                collection,
                breakpointBands,
                minObservations,
                chiSquareProbability,
                minNumOfYearsScaler,
                lambda,
                maxIterations
            }).select(ccdcBands).clip(geometry)
        }

        return of(executeCCDC(collection))
    }
}
