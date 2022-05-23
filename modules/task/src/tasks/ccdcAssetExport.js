const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {switchMap} = require('rxjs')
const ccdc = require('sepal/ee/timeSeries/ccdc')
const {toVisualizationProperties} = require('../ee/visualizations')
const {formatProperties} = require('./formatProperties')

module.exports = {
    submit$: (id, {recipe, bands, scale, assetId, description, visualizations, properties}) => {
        return ccdc(recipe, {selection: bands}).getImage$().pipe(
            switchMap(segments => {
                const formattedProperties = formatProperties({...properties, scale})
                const allBands = getAllBands(bands)
                return exportImageToAsset$({
                    image: segments
                        .set(formattedProperties)
                        .set('startDate', recipe.model.dates.startDate)
                        .set('endDate', recipe.model.dates.endDate)
                        .set('dateFormat', recipe.model.ccdcOptions.dateFormat)
                        .set('surfaceReflectance', recipe.model.options.corrections.includes('SR') && 1)
                        .set(toVisualizationProperties(visualizations, {selection: allBands})),
                    assetId,
                    description,
                    pyramidingPolicy: {'.default': 'sample'},
                    scale,
                    crs: 'EPSG:4326',
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
