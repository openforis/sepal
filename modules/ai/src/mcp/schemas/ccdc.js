const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'CCDC',
    name: 'CCDC',
    description: 'Continuous Change Detection and Classification — detects land cover changes over time using harmonic regression',
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
                    cloudPercentageThreshold: {type: 'integer', minimum: 0, maximum: 100},
                    dataSets: {
                        type: 'object',
                        properties: {
                            LANDSAT: {type: 'array', items: {enum: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']}},
                            SENTINEL_2: {type: 'array', items: {enum: ['SENTINEL_2']}},
                            SENTINEL_1: {type: 'array', items: {enum: ['SENTINEL_1']}}
                        }
                    },
                    breakpointBands: {
                        type: 'array',
                        items: {type: 'string'},
                        description: 'Bands used for break detection (e.g. ndfi, ndvi, swir1)'
                    }
                },
                required: ['dataSets', 'breakpointBands']
            },
            options: {
                type: 'object',
                description: 'Processing options',
                properties: {
                    corrections: {type: 'array', items: {type: 'string'}},
                    orbits: {type: 'array', items: {enum: ['ASCENDING', 'DESCENDING']}},
                    geometricCorrection: {type: 'string', enum: ['ELLIPSOID', 'TERRAIN']},
                    speckleFilter: {type: 'string', enum: ['NONE', 'BOXCAR', 'LEE', 'REFINED_LEE', 'LEE_SIGMA', 'GAMMA_MAP']},
                    outlierRemoval: {type: 'string', enum: ['NONE', 'MODERATE', 'AGGRESSIVE']},
                    orbitOverlap: {type: 'string', enum: ['KEEP', 'REMOVE']},
                    tileOverlap: {type: 'string', enum: ['KEEP', 'REMOVE', 'QUICK_REMOVE']}
                }
            },
            ccdcOptions: {
                type: 'object',
                description: 'CCDC break detection parameters',
                properties: {
                    dateFormat: {type: 'integer', enum: [0, 1, 2], description: '0=fractional years, 1=unix time (ms), 2=unix time (s)'},
                    minObservations: {type: 'integer', minimum: 1, description: 'Minimum observations before fitting'},
                    chiSquareProbability: {type: 'number', minimum: 0, maximum: 1, description: 'Chi-square probability for break detection'},
                    minNumOfYearsScaler: {type: 'number', minimum: 0, description: 'Minimum years scaler'},
                    lambda: {type: 'number', description: 'Regularization lambda'},
                    maxIterations: {type: 'integer', minimum: 1, description: 'Max iterations'}
                }
            }
        },
        required: ['aoi', 'dates', 'sources']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the observation period', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Select satellite data and breakpoint bands', fields: ['sources']},
        {id: 'options', name: 'Processing Options', description: 'Configure processing parameters', fields: ['options']},
        {id: 'ccdcOptions', name: 'CCDC Options', description: 'Configure break detection sensitivity', fields: ['ccdcOptions']}
    ],
    bands: {
        output: ['count']
    },
    visualizations: [
        {name: 'Observation Count', type: 'continuous', bands: ['count'], min: [0], max: [100], palette: ['#000000', '#00FF00']}
    ]
}
