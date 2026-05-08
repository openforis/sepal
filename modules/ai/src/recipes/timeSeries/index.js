const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'TIME_SERIES',
    name: 'Time Series',
    description: 'Per-pixel time series of optical (Landsat / Sentinel-2 / Planet) and/or radar (Sentinel-1) observations across an AOI and date range. Used as input for CCDC, phenology, regression, and chart-based exploration.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Half-open [startDate, endDate)', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Choose Landsat / Sentinel-2 / Sentinel-1 datasets', fields: ['sources']},
        {id: 'options', name: 'Processing Options', description: 'Optical and/or radar processing parameters', fields: ['options']}
    ],
    bands: {
        primary: ['count'],
        note: 'Per-pixel observation count band; the primary use is downstream time-series analysis (CCDC, phenology, regression).'
    },
    visualizations: [
        {name: 'Observation Count', type: 'continuous', bands: ['count'], min: [0], max: [100], palette: ['#000000', '#00FF00']}
    ]
}
