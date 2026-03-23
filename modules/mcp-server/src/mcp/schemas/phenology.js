const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'PHENOLOGY',
    name: 'Phenology',
    description: 'Extract phenological metrics (growing season timing, amplitude) from vegetation index time series',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            dates: {
                type: 'object',
                properties: {
                    fromYear: {type: 'integer', description: 'Start year'},
                    toYear: {type: 'integer', description: 'End year'}
                },
                required: ['fromYear', 'toYear']
            },
            sources: {
                type: 'object',
                properties: {
                    cloudPercentageThreshold: {type: 'integer', minimum: 0, maximum: 100},
                    dataSets: {type: 'object'},
                    band: {type: 'string', description: 'Vegetation index band (e.g. evi, ndvi)'}
                },
                required: ['dataSets', 'band']
            },
            options: {type: 'object'}
        },
        required: ['aoi', 'dates', 'sources']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Year Range', description: 'Set the years to analyze', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Select data sources and vegetation index', fields: ['sources']},
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
