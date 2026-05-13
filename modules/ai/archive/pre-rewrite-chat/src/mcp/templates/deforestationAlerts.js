module.exports = {
    id: 'deforestation-alerts',
    recipeType: 'CHANGE_ALERTS',
    name: 'Deforestation Alerts',
    description: 'Near-real-time deforestation alerts using optical satellite imagery. Requires a reference CCDC or classification recipe.',
    tags: ['deforestation', 'alerts', 'near-real-time', 'change-detection', 'monitoring'],
    requiredOverrides: ['reference'],
    model: {
        reference: {},
        date: {
            monitoringDuration: 2,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {
                LANDSAT: ['LANDSAT_9', 'LANDSAT_8'],
                SENTINEL_2: ['SENTINEL_2']
            }
        },
        options: {
            corrections: ['SR'],
            snowMasking: 'ON',
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE'
        },
        changeAlertsOptions: {
            minConfidence: 5,
            numberOfObservations: 3,
            minNumberOfChanges: 3,
            mustBeConfirmedInMonitoring: true,
            mustBeStableBeforeChange: true,
            mustStayChanged: true
        }
    }
}
