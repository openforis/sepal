const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'BAYTS_HISTORICAL',
    name: 'BayTS Historical',
    description: 'Sentinel-1 historical reference for the BayTS (Bayesian Time Series) deforestation alert pipeline. Computes per-pixel VV/VH means, std-devs, and speckle statistics over a multi-year window — the input distribution for BayTS Alerts.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Half-open historical reference window', fields: ['dates']},
        {id: 'options', name: 'Options', description: 'Sentinel-1 processing parameters (mirrors radarMosaic options)', fields: ['options']}
    ],
    bands: {
        perOrbit: ['VV_mean', 'VV_std', 'VV_speckle', 'VH_mean', 'VH_std', 'VH_speckle', 'orbit']
    },
    visualizations: []
}
