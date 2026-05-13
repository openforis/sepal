const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CHANGE_ALERTS',
    name: 'Change Alerts',
    description: 'CCDC-based per-pixel change-alert detection. Compares recent observations to a CCDC harmonic-regression reference and emits alert pixels when the model fit fails over a confirmation window.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'reference', name: 'Reference', description: 'CCDC recipe or asset providing the harmonic reference', fields: ['reference']},
        {id: 'date', name: 'Monitoring Window', description: 'Calibration + monitoring durations ending at monitoringEnd', fields: ['date']},
        {id: 'sources', name: 'Data Sources', description: 'Sensors for the recent observations', fields: ['sources']},
        {id: 'options', name: 'Processing Options', description: 'Optical / radar / planet processing parameters', fields: ['options']},
        {id: 'changeAlertsOptions', name: 'Change Alerts Options', description: 'Confidence thresholds and confirmation rules', fields: ['changeAlertsOptions']}
    ],
    bands: {
        primary: ['confidence', 'difference', 'detection_count', 'monitoring_observation_count', 'calibration_observation_count', 'last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date']
    },
    visualizations: []
}
