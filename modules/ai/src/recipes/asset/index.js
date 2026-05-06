const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'ASSET_MOSAIC',
    name: 'Asset',
    description: 'Wraps an Earth Engine Image or ImageCollection asset as a SEPAL recipe so it can be visualized, masked, filtered, composited, used as input to other recipes (classification, change detection, etc.), and exported through the standard pipeline. The only recipe that supports the ASSET_BOUNDS AOI variant.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area (or use ASSET_BOUNDS for the asset\'s own geometry)', fields: ['aoi']},
        {id: 'assetDetails', name: 'Asset Details', description: 'Enter the Earth Engine asset path; type, bands, and metadata are loaded from EE', fields: ['assetDetails']},
        {id: 'dates', name: 'Date Filter', description: 'Optionally filter an ImageCollection by date (ALL_DATES, YEAR, or CUSTOM_DATE_RANGE)', fields: ['dates']},
        {id: 'filter', name: 'Filter', description: 'Optionally filter an ImageCollection by image properties (CLOUD_COVER, etc.)', fields: ['filter']},
        {id: 'mask', name: 'Mask', description: 'Optionally mask pixels by band-value constraints (per-image)', fields: ['mask']},
        {id: 'composite', name: 'Composite', description: 'How to reduce an ImageCollection to a single image (MOSAIC, MEDIAN, MEAN, MIN, MAX, SD, MODE)', fields: ['composite']}
    ],
    bands: {
        note: 'Band names are derived from the wrapped asset (assetDetails.bands[*].id)'
    },
    visualizations: [
        {note: 'Visualizations are derived from the wrapped asset (assetDetails.visualizations)'}
    ]
}
