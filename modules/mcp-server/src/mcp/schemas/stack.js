module.exports = {
    id: 'STACK',
    name: 'Stack',
    description: 'Combine bands from multiple images into a single multi-band stack',
    parameterSchema: {
        type: 'object',
        properties: {
            inputImagery: {
                type: 'object',
                properties: {
                    images: {
                        type: 'array',
                        description: 'Input images (recipe references or assets)',
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
            bandNames: {
                type: 'object',
                properties: {
                    bandNames: {
                        type: 'array',
                        description: 'Band selection and renaming',
                        items: {
                            type: 'object',
                            properties: {
                                imageId: {type: 'string'},
                                bands: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: {type: 'string'},
                                            outputName: {type: 'string'}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    workflowSteps: [
        {id: 'inputImagery', name: 'Input Images', description: 'Add images to the stack', fields: ['inputImagery']},
        {id: 'bandNames', name: 'Band Names', description: 'Select and rename bands', fields: ['bandNames']}
    ],
    bands: {
        note: 'Bands are dynamic, derived from selected input bands and output naming'
    },
    visualizations: []
}
