// Default baytsAlerts model. Mirrors GUI defaultModel.
// `reference` and `date.monitoringEnd` are intentionally absent; the user
// must select a BayTS Historical reference and a monitoring end date.

const radarDefaults = require('../baytsHistorical/defaults').getDefaults().options

const getDefaults = () => ({
    reference: {},
    date: {
        monitoringDuration: 2,
        monitoringDurationUnit: 'months'
    },
    options: {...radarDefaults},
    baytsAlertsOptions: {
        wetlandMaskAsset: 'users/wiell/SepalResources/wetlandMask_v1',
        normalization: 'DISABLED',
        sensitivity: 1,
        maxDays: 90,
        highConfidenceThreshold: 0.975,
        lowConfidenceThreshold: 0.85,
        minNonForestProbability: 0.6,
        minChangeProbability: 0.5
    }
})

module.exports = {getDefaults}
