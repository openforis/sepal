module.exports = {
    id: 'ASSET_MOSAIC',
    name: 'Asset',
    description: 'Reference a Google Earth Engine asset as a recipe for visualization and further processing',
    parameterSchema: {
        type: 'object',
        properties: {
            asset: {
                type: 'string',
                description: 'GEE asset path (e.g. users/username/assetName or projects/project/assets/name)'
            },
            assetDetails: {
                type: 'object',
                description: 'Asset metadata (auto-populated)',
                properties: {
                    bands: {type: 'array', items: {type: 'object'}},
                    type: {type: 'string'}
                }
            },
            dates: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['ALL_DATES', 'DATE_RANGE']},
                    fromDate: {type: 'string', format: 'date'},
                    toDate: {type: 'string', format: 'date'}
                }
            },
            composite: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['MOSAIC', 'MEDIAN', 'MEAN', 'MIN', 'MAX']}
                }
            }
        },
        required: ['asset']
    },
    workflowSteps: [
        {id: 'asset', name: 'Asset', description: 'Enter the GEE asset path', fields: ['asset']},
        {id: 'dates', name: 'Date Filter', description: 'Optionally filter by date range', fields: ['dates']},
        {id: 'composite', name: 'Composite', description: 'Choose composite method for image collections', fields: ['composite']}
    ],
    bands: {
        note: 'Bands are dynamic, derived from the GEE asset metadata'
    },
    visualizations: []
}
