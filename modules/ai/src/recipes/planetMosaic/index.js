const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'PLANET_MOSAIC',
    name: 'Planet Mosaic',
    description: 'Cloud-masked composite from Planet imagery — NICFI Basemaps (free for tropical forests, monthly), other Planet Basemaps, or Planet Daily.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Half-open [fromDate, toDate)', fields: ['dates']},
        {id: 'sources', name: 'Data Source', description: 'NICFI / Basemaps / Daily', fields: ['sources']},
        {id: 'options', name: 'Options', description: 'Cloud / shadow / buffer / histogram matching', fields: ['options']}
    ],
    bands: {
        optical: ['blue', 'green', 'red', 'nir'],
        indexes: ['ndvi', 'ndwi', 'evi', 'evi2', 'savi'],
        metadata: ['dayOfYear', 'daysFromTarget']
    },
    visualizations: [
        {name: 'Natural Color', type: 'rgb', bands: ['red', 'green', 'blue'], min: [300, 500, 700], max: [2500, 2200, 2500]},
        {name: 'False Color', type: 'rgb', bands: ['nir', 'red', 'green'], min: [500, 300, 500], max: [5000, 2500, 2200]}
    ]
}
