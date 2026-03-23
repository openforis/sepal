module.exports = {
    id: 'CLASS_CHANGE',
    name: 'Class Change',
    description: 'Detect land cover class transitions between two classified images',
    parameterSchema: {
        type: 'object',
        properties: {
            fromImage: {
                type: 'object',
                description: 'Source "from" classification (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            toImage: {
                type: 'object',
                description: 'Source "to" classification (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            dates: {
                type: 'object',
                properties: {
                    fromDate: {type: 'string', format: 'date'},
                    toDate: {type: 'string', format: 'date'}
                }
            },
            options: {type: 'object'}
        }
    },
    workflowSteps: [
        {id: 'fromImage', name: 'From Image', description: 'Select the baseline classification', fields: ['fromImage']},
        {id: 'toImage', name: 'To Image', description: 'Select the comparison classification', fields: ['toImage']}
    ],
    bands: {
        output: ['transition', 'confidence']
    },
    visualizations: [
        {name: 'Transition', type: 'categorical', bands: ['transition'], description: 'Class transition encoded as from*numClasses + to'}
    ]
}
