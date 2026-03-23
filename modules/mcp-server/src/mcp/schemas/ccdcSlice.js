module.exports = {
    id: 'CCDC_SLICE',
    name: 'CCDC Slice',
    description: 'Extract a temporal slice from a CCDC model at a specific date, producing synthetic imagery from harmonic coefficients',
    parameterSchema: {
        type: 'object',
        properties: {
            date: {
                type: 'object',
                properties: {
                    date: {type: 'string', format: 'date', description: 'Target date for the slice'}
                }
            },
            source: {
                type: 'object',
                description: 'Source CCDC recipe or asset',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string', description: 'Recipe ID or asset path'}
                }
            },
            options: {
                type: 'object',
                properties: {
                    harmonics: {type: 'integer', minimum: 1, maximum: 3, description: 'Number of harmonics (1-3)'},
                    gapStrategy: {type: 'string', enum: ['INTERPOLATE', 'EXTRAPOLATE', 'MASK'], description: 'Strategy for gaps between segments'},
                    extrapolateSegment: {type: 'string', enum: ['CLOSEST', 'PREVIOUS', 'NEXT']},
                    extrapolateMaxDays: {type: 'integer'},
                    skipBreakInLastSegment: {type: 'boolean'}
                }
            }
        },
        required: ['date', 'source']
    },
    workflowSteps: [
        {id: 'source', name: 'Source', description: 'Select the CCDC recipe or asset', fields: ['source']},
        {id: 'date', name: 'Date', description: 'Choose the target date for the slice', fields: ['date']},
        {id: 'options', name: 'Options', description: 'Configure harmonics and gap strategy', fields: ['options']}
    ],
    bands: {
        note: 'Bands are dynamic, derived from the source CCDC recipe. Common suffixes: _rmse, _magnitude, _intercept, _slope, _phase_1/2/3, _amplitude_1/2/3'
    },
    visualizations: []
}
