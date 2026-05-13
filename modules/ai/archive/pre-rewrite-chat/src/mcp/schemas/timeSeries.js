const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'TIME_SERIES',
    name: 'Time Series',
    description: 'Extract temporal band values over a date range for time series analysis',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            dates: {
                type: 'object',
                properties: {
                    startDate: {type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)'},
                    endDate: {type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)'}
                },
                required: ['startDate', 'endDate']
            },
            sources: {
                type: 'object',
                properties: {
                    dataSets: {
                        type: 'object',
                        properties: {
                            LANDSAT: {type: 'array', items: {enum: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']}},
                            SENTINEL_2: {type: 'array', items: {enum: ['SENTINEL_2']}},
                            SENTINEL_1: {type: 'array', items: {enum: ['SENTINEL_1']}}
                        }
                    }
                },
                required: ['dataSets']
            },
            options: {
                type: 'object',
                description: 'Processing options for optical/radar data',
                properties: {
                    corrections: {type: 'array', items: {type: 'string'}},
                    orbits: {type: 'array', items: {enum: ['ASCENDING', 'DESCENDING']}},
                    geometricCorrection: {type: 'string', enum: ['ELLIPSOID', 'TERRAIN']},
                    speckleFilter: {type: 'string', enum: ['NONE', 'BOXCAR', 'LEE', 'REFINED_LEE', 'LEE_SIGMA', 'GAMMA_MAP']},
                    outlierRemoval: {type: 'string', enum: ['NONE', 'MODERATE', 'AGGRESSIVE']},
                    orbitOverlap: {type: 'string', enum: ['KEEP', 'REMOVE']},
                    tileOverlap: {type: 'string', enum: ['KEEP', 'REMOVE', 'QUICK_REMOVE']},
                    compose: {type: 'string', enum: ['MEDOID', 'MEDIAN']},
                    snowMasking: {type: 'string', enum: ['ON', 'OFF']}
                }
            }
        },
        required: ['aoi', 'dates', 'sources']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the time period for the series', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Select satellite data sources', fields: ['sources']},
        {id: 'options', name: 'Processing Options', description: 'Configure processing parameters', fields: ['options']}
    ],
    bands: {
        output: ['count']
    },
    visualizations: [
        {name: 'Observation Count', type: 'continuous', bands: ['count'], min: [0], max: [100], palette: ['#000000', '#00FF00']}
    ]
}
