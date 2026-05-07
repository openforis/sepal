const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'BAYTS_ALERTS',
    name: 'BayTS Alerts',
    description: 'Bayesian time-series deforestation alerts from Sentinel-1 SAR. Compares recent observations against a BayTS Historical reference distribution to flag pixels with high posterior probability of disturbance.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'reference', name: 'Reference', description: 'Select a BayTS Historical recipe or asset', fields: ['reference']},
        {id: 'date', name: 'Monitoring Window', description: 'End date and duration of the monitoring period', fields: ['date']},
        {id: 'options', name: 'Options', description: 'Sentinel-1 processing parameters (typically copied from BayTS Historical)', fields: ['options']},
        {id: 'baytsAlertsOptions', name: 'BayTS Alerts Options', description: 'Alert thresholds, sensitivity, wetland mask', fields: ['baytsAlertsOptions']}
    ],
    bands: {
        primary: ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date']
    },
    visualizations: []
}
