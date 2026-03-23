const {aoiSchema} = require('./_shared/aoi')

module.exports = {
    id: 'CHANGE_ALERTS',
    name: 'Change Alerts',
    description: 'Near-real-time change detection alerts comparing a reference image to monitoring observations',
    parameterSchema: {
        type: 'object',
        properties: {
            aoi: aoiSchema,
            reference: {
                type: 'object',
                description: 'Reference image (recipe or asset)',
                properties: {
                    type: {type: 'string', enum: ['RECIPE_REF', 'ASSET']},
                    id: {type: 'string'}
                }
            },
            date: {
                type: 'object',
                properties: {
                    monitoringDuration: {type: 'integer', description: 'Monitoring period length'},
                    monitoringDurationUnit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']},
                    calibrationDuration: {type: 'integer', description: 'Calibration period length'},
                    calibrationDurationUnit: {type: 'string', enum: ['days', 'weeks', 'months', 'years']}
                }
            },
            sources: {
                type: 'object',
                properties: {
                    cloudPercentageThreshold: {type: 'integer', minimum: 0, maximum: 100},
                    dataSets: {type: 'object'}
                }
            },
            options: {type: 'object'},
            changeAlertsOptions: {
                type: 'object',
                properties: {
                    minConfidence: {type: 'number', minimum: 0, maximum: 100},
                    numberOfObservations: {type: 'integer'},
                    minNumberOfChanges: {type: 'integer'},
                    mustBeConfirmedInMonitoring: {type: 'boolean'},
                    mustBeStableBeforeChange: {type: 'boolean'},
                    mustStayChanged: {type: 'boolean'}
                }
            }
        },
        required: ['reference', 'date']
    },
    workflowSteps: [
        {id: 'reference', name: 'Reference', description: 'Select the reference image', fields: ['reference']},
        {id: 'date', name: 'Monitoring Period', description: 'Set monitoring and calibration periods', fields: ['date']},
        {id: 'sources', name: 'Data Sources', description: 'Select satellite data sources', fields: ['sources']},
        {id: 'changeAlertsOptions', name: 'Alert Options', description: 'Configure alert sensitivity', fields: ['changeAlertsOptions']}
    ],
    bands: {
        alerts: ['confidence', 'difference', 'detection_count', 'monitoring_observation_count', 'calibration_observation_count', 'last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date']
    },
    visualizations: [
        {name: 'Confidence', type: 'continuous', bands: ['confidence'], min: [0], max: [10], palette: ['#000000', '#FF0000']}
    ]
}
