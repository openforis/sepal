const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'PHENOLOGY',
    name: 'Phenology',
    description: 'Extracts seasonal vegetation-cycle metrics — start/end of season, peak greenness, amplitude, growing-season length — from a multi-year time series of a vegetation index (typically EVI or NDVI).',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Year Range', description: 'Calendar-year range (inclusive)', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Select sensors and the vegetation-index band', fields: ['sources']},
        {id: 'options', name: 'Options', description: 'Processing options', fields: ['options']}
    ],
    bands: {
        summary: ['background', 'amplitude', 'median'],
        seasons: ['dayOfYear_1', 'days_1', 'median_1', 'slope_1', 'offset_1', 'dayOfYear_2', 'days_2', 'median_2', 'slope_2', 'offset_2'],
        monthly: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    },
    visualizations: [
        {name: 'Amplitude', type: 'continuous', bands: ['amplitude'], min: [0], max: [5000], palette: ['#000000', '#00FF00']},
        {name: 'Day of Year (Season 1)', type: 'continuous', bands: ['dayOfYear_1'], min: [0], max: [366], palette: ['#0000FF', '#FF0000']}
    ]
}
