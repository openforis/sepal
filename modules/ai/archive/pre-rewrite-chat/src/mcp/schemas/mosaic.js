const {aoiSchema} = require('./_shared/aoi')

// Canonical dataset availability — used by the validator for date-range checks.
// Mirrors modules/gui/.../opticalMosaic/sources.js dataSetById.
const dataSetAvailability = {
    LANDSAT_9: {fromYear: 2021, name: 'Landsat 9'},
    LANDSAT_8: {fromYear: 2013, name: 'Landsat 8'},
    LANDSAT_7: {fromYear: 1999, name: 'Landsat 7'},
    LANDSAT_TM: {fromYear: 1982, toYear: 2012, name: 'Landsat 4-5'},
    LANDSAT_9_T2: {fromYear: 2021, name: 'Landsat 9 T2'},
    LANDSAT_8_T2: {fromYear: 2013, name: 'Landsat 8 T2'},
    LANDSAT_7_T2: {fromYear: 1999, name: 'Landsat 7 T2'},
    LANDSAT_TM_T2: {fromYear: 1984, toYear: 2012, name: 'Landsat 4-5 T2'},
    SENTINEL_2: {fromYear: 2015, name: 'Sentinel-2'}
}

const parameterSchema = {
    type: 'object',
    properties: {
        aoi: aoiSchema,
        dates: {
            type: 'object',
            description: 'Date configuration. At minimum provide targetDate; seasonStart/seasonEnd default to calendar year.',
            properties: {
                type: {
                    type: 'string',
                    enum: ['YEARLY_TIME_SCAN'],
                    description: 'Date scan type (currently only YEARLY_TIME_SCAN is supported)'
                },
                targetDate: {
                    type: 'string',
                    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    description: 'Target date (YYYY-MM-DD). Imagery closest to this date is preferred. Must be between 1982-08-22 and today.'
                },
                seasonStart: {
                    type: 'string',
                    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    description: 'Season start date (YYYY-MM-DD). Must be within [targetDate - 1 year + 1 day, targetDate]. Defaults to Jan 1 of target year.'
                },
                seasonEnd: {
                    type: 'string',
                    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    description: 'Season end date (YYYY-MM-DD). Must be within [targetDate + 1 day, targetDate + 1 year]. Defaults to Jan 1 of next year.'
                },
                yearsBefore: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 25,
                    description: 'Number of past seasons to include (default: 0)'
                },
                yearsAfter: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 25,
                    description: 'Number of future seasons to include (default: 0)'
                }
            },
            required: ['targetDate']
        },
        sources: {
            type: 'object',
            description: 'Satellite data sources and cloud filtering.',
            properties: {
                cloudPercentageThreshold: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                    description: 'Maximum cloud cover percentage for scene filtering (default: 75)'
                },
                dataSets: {
                    type: 'object',
                    description: 'Data sets grouped by source. Provide at least one source group (LANDSAT and/or SENTINEL_2). If both groups are provided, CALIBRATE correction is added and scene selection is forced to ALL.',
                    properties: {
                        LANDSAT: {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: [
                                    'LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM',
                                    'LANDSAT_9_T2', 'LANDSAT_8_T2', 'LANDSAT_7_T2', 'LANDSAT_TM_T2'
                                ]
                            },
                            description: 'Landsat missions. LANDSAT_9 (2021+), LANDSAT_8 (2013+), LANDSAT_7 (1999+), LANDSAT_TM (1982-2012). _T2 variants are Tier 2 data.'
                        },
                        SENTINEL_2: {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: ['SENTINEL_2']
                            },
                            description: 'Sentinel-2 mission (2015+)'
                        }
                    },
                    minProperties: 1
                }
            },
            required: ['dataSets']
        },
        sceneSelectionOptions: {
            type: 'object',
            description: 'How scenes are selected for the mosaic.',
            properties: {
                type: {
                    type: 'string',
                    enum: ['ALL', 'SELECT'],
                    description: 'ALL uses all available scenes. SELECT allows manual scene selection (only available with a single source group).'
                },
                targetDateWeight: {
                    type: 'number',
                    enum: [0, 0.5, 1],
                    description: 'Weight for target date proximity vs cloud-free quality when ranking scenes. 0 = prefer cloud-free, 0.5 = balanced, 1 = prefer target date. Only meaningful with SELECT mode.'
                }
            }
        },
        compositeOptions: {
            type: 'object',
            description: 'Corrections, cloud masking, filtering, and compositing options.',
            properties: {
                // Corrections
                corrections: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['SR', 'BRDF', 'CALIBRATE']
                    },
                    description: 'Applied corrections. SR = Surface Reflectance, BRDF = Bidirectional Reflectance correction, CALIBRATE = cross-sensor calibration (requires multiple source groups AND cannot be used with SR).'
                },
                brdfMultiplier: {
                    type: 'number',
                    exclusiveMinimum: 0,
                    description: 'BRDF correction multiplier (default: 4). Only used when BRDF correction is enabled.'
                },

                // Filters
                filters: {
                    type: 'array',
                    description: 'Percentile-based scene filters. Each filter keeps scenes above (or below, depending on type) the given percentile.',
                    items: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['SHADOW', 'HAZE', 'NDVI', 'DAY_OF_YEAR'],
                                description: 'Filter type. HAZE is not available with SR correction.'
                            },
                            percentile: {
                                type: 'integer',
                                minimum: 0,
                                maximum: 100,
                                description: 'Percentile threshold (0 = off, 100 = most aggressive filtering)'
                            }
                        },
                        required: ['type', 'percentile']
                    }
                },

                // Sentinel-2 overlap handling
                orbitOverlap: {
                    type: 'string',
                    enum: ['KEEP', 'REMOVE'],
                    description: 'How to handle Sentinel-2 orbit overlaps (default: KEEP). Only relevant for Sentinel-2 data.'
                },
                tileOverlap: {
                    type: 'string',
                    enum: ['KEEP', 'QUICK_REMOVE', 'REMOVE'],
                    description: 'How to handle Sentinel-2 tile overlaps (default: QUICK_REMOVE). Only relevant for Sentinel-2 data.'
                },

                // Cloud masking - which methods to include
                includedCloudMasking: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'sepalCloudScore',
                            'landsatCFMask',
                            'sentinel2CloudScorePlus',
                            'sentinel2CloudProbability',
                            'pino26'
                        ]
                    },
                    description: 'Cloud masking methods to apply. sepalCloudScore works with all sources. landsatCFMask requires LANDSAT. sentinel2CloudScorePlus and sentinel2CloudProbability require SENTINEL_2. pino26 requires SENTINEL_2 only with no SR correction.'
                },

                // Cloud masking parameters - Sentinel-2 Cloud Probability
                sentinel2CloudProbabilityMaxCloudProbability: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                    description: 'Max cloud probability threshold for Sentinel-2 Cloud Probability masking (default: 65)'
                },

                // Cloud masking parameters - Sentinel-2 Cloud Score+
                sentinel2CloudScorePlusBand: {
                    type: 'string',
                    enum: ['cs', 'cs_cdf'],
                    description: 'Cloud Score+ band to use. cs = raw score, cs_cdf = CDF-normalized (default: cs_cdf)'
                },
                sentinel2CloudScorePlusMaxCloudProbability: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                    description: 'Max cloud probability threshold for Cloud Score+ masking (default: 45)'
                },

                // Cloud masking parameters - Landsat CFMask
                landsatCFMaskCloudMasking: {
                    type: 'string',
                    enum: ['OFF', 'MODERATE', 'AGGRESSIVE'],
                    description: 'Landsat CFMask cloud masking level (default: MODERATE)'
                },
                landsatCFMaskCloudShadowMasking: {
                    type: 'string',
                    enum: ['OFF', 'MODERATE', 'AGGRESSIVE'],
                    description: 'Landsat CFMask cloud shadow masking level (default: MODERATE)'
                },
                landsatCFMaskCirrusMasking: {
                    type: 'string',
                    enum: ['OFF', 'MODERATE', 'AGGRESSIVE'],
                    description: 'Landsat CFMask cirrus masking level (default: MODERATE)'
                },
                landsatCFMaskDilatedCloud: {
                    type: 'string',
                    enum: ['KEEP', 'REMOVE'],
                    description: 'Whether to mask dilated cloud pixels in Landsat CFMask (default: REMOVE)'
                },

                // Cloud masking parameters - SEPAL Cloud Score
                sepalCloudScoreMaxCloudProbability: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 100,
                    description: 'Max cloud probability for SEPAL cloud score masking (default: 30)'
                },

                // Post-processing
                cloudBuffer: {
                    type: 'integer',
                    enum: [0, 120, 600],
                    description: 'Buffer around masked clouds in meters. 0 = none, 120 = moderate, 600 = aggressive (default: 0)'
                },
                holes: {
                    type: 'string',
                    enum: ['PREVENT', 'ALLOW'],
                    description: 'Whether to prevent holes (gaps) in the mosaic by filling with lower-quality pixels (default: ALLOW)'
                },
                snowMasking: {
                    type: 'string',
                    enum: ['ON', 'OFF'],
                    description: 'Whether to mask snow pixels (default: ON)'
                },

                // Compositing method
                compose: {
                    type: 'string',
                    enum: ['MEDOID', 'MEDIAN'],
                    description: 'Compositing method. MEDOID preserves spectral integrity, MEDIAN smooths noise (default: MEDOID)'
                }
            }
        },
        scenes: {
            type: 'object',
            description: 'Manually selected scenes per scene area (used with SELECT scene selection mode). Usually left empty for ALL mode.'
        }
    },
    required: ['aoi', 'dates', 'sources']
}

const getDefaults = () => {
    const now = new Date()
    const year = now.getFullYear()
    return {
        dates: {
            type: 'YEARLY_TIME_SCAN',
            targetDate: `${year}-07-02`,
            seasonStart: `${year}-01-01`,
            seasonEnd: `${year + 1}-01-01`,
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
        },
        sceneSelectionOptions: {
            type: 'ALL',
            targetDateWeight: 0
        },
        compositeOptions: {
            corrections: ['SR', 'BRDF'],
            brdfMultiplier: 4,
            filters: [],
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
            sentinel2CloudProbabilityMaxCloudProbability: 65,
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            landsatCFMaskCloudMasking: 'MODERATE',
            landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE',
            landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffer: 0,
            holes: 'ALLOW',
            snowMasking: 'ON',
            compose: 'MEDOID'
        },
        scenes: {}
    }
}

module.exports = {
    id: 'MOSAIC',
    name: 'Optical Mosaic',
    description: 'Cloud-free composite from optical satellite imagery (Landsat, Sentinel-2)',
    parameterSchema,
    getDefaults,
    dataSetAvailability,
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
