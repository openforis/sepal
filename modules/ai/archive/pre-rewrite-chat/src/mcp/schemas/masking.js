module.exports = {
    id: 'MASKING',
    name: 'Masking',
    description: 'Apply a mask image to another image, removing pixels matching mask criteria',
    parameterSchema: {
        type: 'object',
        properties: {
            imageToMask: {
                type: 'object',
                description: 'Image to apply the mask to (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            maskImage: {
                type: 'object',
                description: 'Mask image (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            maskOptions: {
                type: 'object',
                properties: {
                    band: {type: 'string', description: 'Band to use from the mask image'},
                    values: {type: 'array', items: {type: 'number'}, description: 'Pixel values to mask out'},
                    negate: {type: 'boolean', description: 'If true, keep only the masked values'}
                }
            }
        }
    },
    workflowSteps: [
        {id: 'imageToMask', name: 'Image', description: 'Select the image to mask', fields: ['imageToMask']},
        {id: 'maskImage', name: 'Mask', description: 'Select the mask image', fields: ['maskImage']},
        {id: 'maskOptions', name: 'Options', description: 'Configure mask band and values', fields: ['maskOptions']}
    ],
    bands: {
        note: 'Bands are passed through from the input image'
    },
    visualizations: []
}
