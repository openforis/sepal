const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'CCDC_SLICE',
    name: 'CCDC Slice',
    description: 'Extract a temporal slice from a CCDC model at a specific date — produces synthetic imagery from the harmonic coefficients of whichever CCDC segment is active on that date.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'source', name: 'Source', description: 'Select the CCDC recipe or asset', fields: ['source']},
        {id: 'date', name: 'Date', description: 'Target date for the slice', fields: ['date']},
        {id: 'options', name: 'Options', description: 'Harmonics and gap-handling strategy', fields: ['options']}
    ],
    bands: {
        note: 'Bands are derived from the source CCDC recipe — typically the same band names as the underlying CCDC time series, with synthesized values at the slice date.'
    },
    visualizations: []
}
