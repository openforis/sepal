const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'INDEX_CHANGE',
    name: 'Index Change',
    description: 'Before/after spectral index change detection between two dates or images',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            fromImage: {
                type: 'object',
                description: 'Source "from" image (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            toImage: {
                type: 'object',
                description: 'Source "to" image (recipe reference or asset)',
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
            legend: {
                type: 'object',
                properties: {
                    entries: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                color: {type: 'string'},
                                value: {type: 'integer'},
                                label: {type: 'string'},
                                constraints: {type: 'array', items: {type: 'object'}}
                            }
                        }
                    }
                }
            },
            options: {
                type: 'object',
                properties: {
                    minConfidence: {type: 'number', description: 'Minimum confidence threshold'}
                }
            }
        }
    },
    workflowSteps: [
        {id: 'fromImage', name: 'From Image', description: 'Select the baseline image', fields: ['fromImage']},
        {id: 'toImage', name: 'To Image', description: 'Select the comparison image', fields: ['toImage']},
        {id: 'legend', name: 'Legend', description: 'Define change classes', fields: ['legend']},
        {id: 'options', name: 'Options', description: 'Set confidence threshold', fields: ['options']}
    ],
    bands: {
        output: ['change', 'difference', 'normalized_difference', 'ratio', 'error', 'confidence']
    },
    visualizations: [
        {name: 'Change', type: 'categorical', bands: ['change'], description: 'Decrease/Stable/Increase'},
        {name: 'Difference', type: 'continuous', bands: ['difference'], min: [-1], max: [1], palette: ['#d73027', '#ffffff', '#1a9850']}
    ]
}
