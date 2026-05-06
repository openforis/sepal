const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellite imagery (Landsat 4-9, Sentinel-2). Applies per-scene corrections and per-pixel cloud/shadow/snow masking, then reduces surviving observations to a single per-pixel value.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the target date and seasonal window', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Choose Landsat and/or Sentinel-2 datasets', fields: ['sources']},
        {id: 'sceneSelectionOptions', name: 'Scene Selection', description: 'Use all eligible scenes or pick manually', fields: ['sceneSelectionOptions']},
        {id: 'compositeOptions', name: 'Composite Options', description: 'Configure corrections, cloud masking, and compositing', fields: ['compositeOptions']}
    ],
    bands: {
        optical: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
        sentinel2Extra: ['redEdge1', 'redEdge2', 'redEdge3', 'redEdge4', 'aerosol', 'waterVapor'],
        landsatExtra: ['thermal', 'thermal2', 'pan', 'cirrus'],
        tasseledCap: ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'],
        indexes: ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'kndvi'],
        metadata: ['dayOfYear', 'daysFromTarget']
    },
    visualizations: [
        {name: 'Natural Color', type: 'rgb', bands: ['red', 'green', 'blue'], min: [200, 400, 600], max: [2400, 2200, 2400]},
        {name: 'False Color (NIR)', type: 'rgb', bands: ['nir', 'red', 'green'], min: [500, 200, 400], max: [5000, 2400, 2200]},
        {name: 'False Color (SWIR)', type: 'rgb', bands: ['nir', 'swir1', 'red'], min: [500, 100, 200], max: [5000, 4900, 2400]},
        {name: 'NDVI', type: 'continuous', bands: ['ndvi'], min: [-10000], max: [10000], palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']}
    ]
}
