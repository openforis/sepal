const opticalSourcesSchema = {
    type: 'object',
    description: 'Optical data source configuration',
    properties: {
        cloudPercentageThreshold: {
            type: 'integer', minimum: 0, maximum: 100,
            description: 'Maximum cloud percentage for scene filtering (default: 75)'
        },
        dataSets: {
            type: 'object',
            description: 'Data sets grouped by source. At least one source group must be provided.',
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
                    description: 'Landsat missions. Tier 1: LANDSAT_9 (2021+), LANDSAT_8 (2013+), LANDSAT_7 (1999+), LANDSAT_TM (1982-2012). Tier 2 variants (_T2) have the same date ranges.'
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
        },
        breakpointBands: {
            type: 'array',
            items: {type: 'string'},
            description: 'Bands used for breakpoint detection (CCDC)'
        }
    },
    required: ['dataSets']
}

module.exports = {opticalSourcesSchema}
