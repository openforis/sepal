const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CCDC',
    name: 'CCDC',
    description: 'Continuous Change Detection and Classification — fits per-pixel piecewise harmonic regression to a multi-year time series and detects breakpoints. Produces segment coefficients consumed by CCDC Slice for synthetic-imagery rendering at any date.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Half-open [startDate, endDate)', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Sensors and breakpoint bands', fields: ['sources']},
        {id: 'options', name: 'Processing Options', description: 'Optical and/or radar processing parameters', fields: ['options']},
        {id: 'ccdcOptions', name: 'CCDC Options', description: 'Break detection sensitivity (preset: conservative / moderate / aggressive)', fields: ['ccdcOptions']}
    ],
    bands: {
        note: 'Output bands are dynamic — per breakpoint band, segment coefficients (intercept, slope, harmonics 1..3 cos/sin), magnitude, RMSE, plus break dates. Use CCDC Slice to render synthetic imagery from these.'
    },
    visualizations: []
}
