const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {forkJoin, switchMap} = require('rxjs')
const ccdc = require('#sepal/ee/timeSeries/ccdc')
const {toVisualizationProperties} = require('../ee/visualizations')
const {formatProperties} = require('./formatProperties')

module.exports = {
    submit$: (taskId, {recipe, bands, scale, visualizations, properties, ...other}) => {
        const segments = ccdc(recipe, {selection: bands})
        return forkJoin({
            segments: segments.getImage$(),
            geometry: segments.getGeometry$()
        }).pipe(
            switchMap(({segments, geometry}) => {
                const formattedProperties = formatProperties({...properties, scale})
                const allBands = getAllBands(bands)
                return exportImageToAsset$(taskId, {
                    ...other,
                    image: segments
                        .set(formattedProperties)
                        .set('startDate', recipe.model.dates.startDate)
                        .set('endDate', recipe.model.dates.endDate)
                        .set('dateFormat', recipe.model.ccdcOptions.dateFormat)
                        .set('surfaceReflectance', recipe.model.options.corrections?.includes('SR') && 1)
                        .set(toVisualizationProperties(visualizations, {selection: allBands})),
                    region: geometry.bounds(),
                    scale,
                    pyramidingPolicy: {'.default': 'sample'},
                    maxPixels: 1e13
                })
            })
        )
    }
}

const getAllBands = bands => {
    const rmse = bands.map(band => `${band}_rmse`)
    const magnitude = bands.map(band => `${band}_magnitude`)
    const intercept = bands.map(band => `${band}_intercept`)
    const slope = bands.map(band => `${band}_slope`)
    const phase1 = bands.map(band => `${band}_phase_1`)
    const amplitude1 = bands.map(band => `${band}_amplitude_1`)
    const phase2 = bands.map(band => `${band}_phase_2`)
    const amplitude2 = bands.map(band => `${band}_amplitude_2`)
    const phase3 = bands.map(band => `${band}_phase_3`)
    const amplitude3 = bands.map(band => `${band}_amplitude_3`)
    const segmentBands = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']
    return [
        ...bands,
        ...rmse,
        ...magnitude,
        ...intercept,
        ...slope,
        ...phase1,
        ...amplitude1,
        ...phase2,
        ...amplitude2,
        ...phase3,
        ...amplitude3,
        ...segmentBands
    ]
}
