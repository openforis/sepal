const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'BAYTS_HISTORICAL',
    name: 'BayTS Historical',
    description: 'Build a Bayesian time series historical reference from Sentinel-1 SAR data for forest monitoring',
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
            options: {
                type: 'object',
                properties: {
                    orbits: {type: 'array', items: {enum: ['ASCENDING', 'DESCENDING']}},
                    orbitNumbers: {type: 'string', enum: ['ALL', 'DOMINANT']},
                    geometricCorrection: {type: 'string', enum: ['ELLIPSOID', 'TERRAIN']},
                    spatialSpeckleFilter: {type: 'string', enum: ['NONE', 'LEE', 'LEE_SIGMA', 'GAMMA_MAP', 'BOXCAR', 'REFINED_LEE']},
                    kernelSize: {type: 'integer'},
                    outlierRemoval: {type: 'string', enum: ['NONE', 'MODERATE', 'AGGRESSIVE']},
                    mask: {type: 'array', items: {type: 'string'}},
                    minAngle: {type: 'number'},
                    maxAngle: {type: 'number'},
                    minObservations: {type: 'integer'}
                }
            }
        },
        required: ['aoi', 'dates']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the historical reference period', fields: ['dates']},
        {id: 'options', name: 'Options', description: 'Configure radar processing', fields: ['options']}
    ],
    bands: {
        perOrbit: ['VV_mean', 'VV_std', 'VV_speckle', 'VH_mean', 'VH_std', 'VH_speckle', 'orbit']
    },
    visualizations: []
}
