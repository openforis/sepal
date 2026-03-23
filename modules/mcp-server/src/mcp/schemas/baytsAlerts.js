const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'BAYTS_ALERTS',
    name: 'BayTS Alerts',
    description: 'Bayesian time series deforestation alerts using Sentinel-1 SAR data against a historical reference',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            reference: {
                type: 'object',
                description: 'BayTS Historical reference (recipe reference or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            date: {
                type: 'object',
                properties: {
                    monitoringDuration: {type: 'integer'},
                    monitoringDurationUnit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']}
                }
            },
            options: {type: 'object'},
            baytsAlertsOptions: {
                type: 'object',
                properties: {
                    normalization: {type: 'string', enum: ['DISABLED', 'ENABLED']},
                    sensitivity: {type: 'number', minimum: 0},
                    maxDays: {type: 'integer'},
                    highConfidenceThreshold: {type: 'number', minimum: 0, maximum: 1},
                    lowConfidenceThreshold: {type: 'number', minimum: 0, maximum: 1},
                    minNonForestProbability: {type: 'number', minimum: 0, maximum: 1},
                    minChangeProbability: {type: 'number', minimum: 0, maximum: 1}
                }
            }
        },
        required: ['reference', 'date']
    },
    workflowSteps: [
        {id: 'reference', name: 'Reference', description: 'Select the BayTS Historical reference', fields: ['reference']},
        {id: 'date', name: 'Monitoring Period', description: 'Set the monitoring duration', fields: ['date']},
        {id: 'baytsAlertsOptions', name: 'Alert Options', description: 'Configure alert sensitivity thresholds', fields: ['baytsAlertsOptions']}
    ],
    bands: {
        alerts: ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date', 'VV', 'VH', 'ratio_VV_VH']
    },
    visualizations: [
        {name: 'Flag', type: 'categorical', bands: ['flag'], description: 'Alert flag status'}
    ]
}
