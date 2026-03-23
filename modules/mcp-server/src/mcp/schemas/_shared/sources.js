const opticalSourcesSchema = {
    type: 'object',
    description: 'Optical data source configuration',
    properties: {
        cloudPercentageThreshold: {
            type: 'integer', minimum: 0, maximum: 100,
            description: 'Maximum cloud percentage for scene filtering'
        },
        dataSets: {
            type: 'object',
            description: 'Data sets to use',
            properties: {
                LANDSAT: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
                    },
                    description: 'Landsat missions to include'
                },
                SENTINEL_2: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['SENTINEL_2']
                    },
                    description: 'Sentinel-2 missions to include'
                }
            }
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
