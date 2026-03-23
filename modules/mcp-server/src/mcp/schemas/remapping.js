module.exports = {
    id: 'REMAPPING',
    name: 'Remapping',
    description: 'Remap pixel values of a classified image to a new legend/class scheme',
    parameterSchema: {
        type: 'object',
        properties: {
            inputImage: {
                type: 'object',
                description: 'Source classified image (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            legend: {
                type: 'object',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                value: {type: 'integer'},
                                label: {type: 'string'},
                                color: {type: 'string'}
                            }
                        }
                    }
                }
            },
            mapping: {
                type: 'object',
                description: 'Value mapping from source to target classes'
            }
        }
    },
    workflowSteps: [
        {id: 'inputImage', name: 'Input Image', description: 'Select the image to remap', fields: ['inputImage']},
        {id: 'legend', name: 'Legend', description: 'Define the target legend', fields: ['legend']},
        {id: 'mapping', name: 'Mapping', description: 'Map source values to target classes', fields: ['mapping']}
    ],
    bands: {
        output: ['class']
    },
    visualizations: [
        {name: 'Remapped Classes', type: 'categorical', bands: ['class'], description: 'Remapped class values'}
    ]
}
