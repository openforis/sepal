const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellite imagery (Landsat, Sentinel-2)',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            dates: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['YEARLY_TIME_SCAN', 'SEASONAL', 'FIXED']},
                    targetDate: {type: 'string', format: 'date', description: 'Target date (YYYY-MM-DD)'},
                    seasonStart: {type: 'string', format: 'date'},
                    seasonEnd: {type: 'string', format: 'date'},
                    yearsBefore: {type: 'integer', minimum: 0},
                    yearsAfter: {type: 'integer', minimum: 0}
                },
                required: ['type', 'targetDate']
            },
            sources: {
                type: 'object',
                properties: {
                    cloudPercentageThreshold: {type: 'integer', minimum: 0, maximum: 100},
                    dataSets: {
                        type: 'object',
                        properties: {
                            LANDSAT: {type: 'array', items: {enum: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']}},
                            SENTINEL_2: {type: 'array', items: {enum: ['SENTINEL_2']}}
                        }
                    }
                },
                required: ['dataSets']
            },
            compositeOptions: {
                type: 'object',
                properties: {
                    corrections: {type: 'array', items: {enum: ['SR', 'BRDF', 'CALIBRATE']}},
                    brdfMultiplier: {type: 'number', minimum: 0},
                    filters: {type: 'array', items: {type: 'object'}},
                    compose: {type: 'string', enum: ['MEDOID', 'MEDIAN']},
                    includedCloudMasking: {type: 'array', items: {type: 'string'}},
                    snowMasking: {type: 'string', enum: ['ON', 'OFF']},
                    holes: {type: 'string', enum: ['ALLOW', 'REMOVE']},
                    orbitOverlap: {type: 'string', enum: ['KEEP', 'REMOVE']},
                    tileOverlap: {type: 'string', enum: ['KEEP', 'REMOVE', 'QUICK_REMOVE']}
                }
            },
            sceneSelectionOptions: {
                type: 'object',
                properties: {
                    type: {type: 'string', enum: ['ALL', 'SELECT']},
                    targetDateWeight: {type: 'number', minimum: 0, maximum: 1}
                }
            }
        },
        required: ['aoi', 'dates', 'sources']
    },
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area to mosaic', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set target date and season', fields: ['dates']},
        {id: 'sources', name: 'Data Sources', description: 'Select satellite data sources', fields: ['sources']},
        {id: 'compositeOptions', name: 'Composite Options', description: 'Configure cloud masking, corrections, and compositing', fields: ['compositeOptions']}
    ],
    bands: {
        optical: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
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
