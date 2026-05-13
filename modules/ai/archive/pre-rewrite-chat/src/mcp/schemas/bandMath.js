module.exports = {
    id: 'BAND_MATH',
    name: 'Band Math',
    description: 'Apply mathematical expressions to image bands to create derived products',
    parameterSchema: {
        type: 'object',
        properties: {
            inputImagery: {
                type: 'object',
                properties: {
                    images: {
                        type: 'array',
                        description: 'Input images providing bands for expressions',
                        items: {
                            type: 'object',
                            properties: {
                                type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                                id: {type: 'string'}
                            }
                        }
                    }
                }
            },
            calculations: {
                type: 'object',
                properties: {
                    calculations: {
                        type: 'array',
                        description: 'Band math expressions',
                        items: {
                            type: 'object',
                            properties: {
                                name: {type: 'string', description: 'Output band name'},
                                expression: {type: 'string', description: 'Math expression using input band names'},
                                bandName: {type: 'string'},
                                type: {type: 'string', enum: ['EXPRESSION', 'BAND']}
                            }
                        }
                    }
                }
            },
            outputBands: {
                type: 'object',
                properties: {
                    outputImages: {type: 'array', items: {type: 'object'}}
                }
            }
        }
    },
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Images', description: 'Add source images', fields: ['inputImagery']},
        {id: 'calculations', name: 'Calculations', description: 'Define band math expressions', fields: ['calculations']},
        {id: 'outputBands', name: 'Output Bands', description: 'Configure output band selection', fields: ['outputBands']}
    ],
    bands: {
        note: 'Bands are dynamic, derived from calculation expressions'
    },
    visualizations: []
}
