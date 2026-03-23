const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'PLANET_MOSAIC',
    name: 'Planet Mosaic',
    description: 'Planet NICFI mosaic with cloud and shadow masking',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            dates: {
                type: 'object',
                properties: {
                    fromDate: {type: 'string', format: 'date'},
                    toDate: {type: 'string', format: 'date'}
                },
                required: ['fromDate', 'toDate']
            },
            sources: {
                type: 'object',
                properties: {
                    source: {type: 'string', enum: ['NICFI', 'BASEMAPS']},
                    histogramMatching: {type: 'string', enum: ['DISABLED', 'ENABLED']}
                }
            },
            options: {
                type: 'object',
                properties: {
                    cloudThreshold: {type: 'number', minimum: 0, maximum: 1},
                    shadowThreshold: {type: 'number', minimum: 0, maximum: 1},
                    cloudBuffer: {type: 'integer', minimum: 0}
                }
            }
        },
        required: ['aoi', 'dates']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the temporal range', fields: ['dates']},
        {id: 'sources', name: 'Data Source', description: 'Select Planet source', fields: ['sources']},
        {id: 'options', name: 'Options', description: 'Configure cloud/shadow masking', fields: ['options']}
    ],
    bands: {
        optical: ['blue', 'green', 'red', 'nir'],
        indexes: ['ndvi', 'ndwi', 'evi', 'evi2', 'savi']
    },
    visualizations: [
        {name: 'Natural Color', type: 'rgb', bands: ['red', 'green', 'blue'], min: [300, 500, 700], max: [2500, 2200, 2500]},
        {name: 'False Color', type: 'rgb', bands: ['nir', 'red', 'green'], min: [500, 300, 500], max: [5000, 2500, 2200]}
    ]
}
