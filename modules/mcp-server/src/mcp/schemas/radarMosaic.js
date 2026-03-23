const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'RADAR_MOSAIC',
    name: 'Radar Mosaic',
    description: 'Sentinel-1 SAR mosaic with speckle filtering and terrain correction',
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
                    orbitNumbers: {type: 'string'},
                    geometricCorrection: {type: 'string', enum: ['ELLIPSOID', 'TERRAIN']},
                    spatialSpeckleFilter: {type: 'string', enum: ['NONE', 'LEE', 'LEE_SIGMA', 'GAMMA_MAP', 'BOXCAR', 'REFINED_LEE']},
                    kernelSize: {type: 'integer'},
                    sigma: {type: 'number'},
                    multitemporalSpeckleFilter: {type: 'string', enum: ['NONE', 'QUEGAN', 'RABASAR']},
                    numberOfImages: {type: 'integer'},
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
        {id: 'dates', name: 'Date Range', description: 'Set the temporal range', fields: ['dates']},
        {id: 'options', name: 'Processing Options', description: 'Configure orbit, speckle filtering, terrain correction', fields: ['options']}
    ],
    bands: {
        pointInTime: ['VV', 'VH', 'ratio_VV_VH', 'orbit'],
        timeScan: ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'ratio_VV_med_VH_med', 'NDCV'],
        metadata: ['dayOfYear', 'daysFromTarget']
    },
    visualizations: [
        {name: 'VV', type: 'continuous', bands: ['VV'], min: [-20], max: [2]},
        {name: 'VH', type: 'continuous', bands: ['VH'], min: [-25], max: [-5]},
        {name: 'VV/VH/Ratio', type: 'rgb', bands: ['VV', 'VH', 'ratio_VV_VH'], min: [-20, -25, 0], max: [2, -5, 10]}
    ]
}
