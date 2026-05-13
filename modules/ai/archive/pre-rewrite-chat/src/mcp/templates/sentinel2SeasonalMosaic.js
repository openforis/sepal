module.exports = {
    id: 'sentinel2-seasonal-mosaic',
    recipeType: 'MOSAIC',
    name: 'Seasonal Sentinel-2 Composite',
    description: 'Seasonal Sentinel-2 composite at 10m resolution with cloud masking. Ideal for high-resolution land cover mapping.',
    tags: ['sentinel-2', 'seasonal', 'optical', 'composite', 'high-resolution'],
    requiredOverrides: ['aoi'],
    model: {
        dates: {
            type: 'YEARLY_TIME_SCAN',
            targetDate: '2024-06-15',
            seasonStart: '2024-04-01',
            seasonEnd: '2024-10-01',
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {SENTINEL_2: ['SENTINEL_2']}
        },
        compositeOptions: {
            corrections: ['SR', 'BRDF'],
            brdfMultiplier: 4,
            compose: 'MEDOID',
            snowMasking: 'ON',
            holes: 'ALLOW',
            includedCloudMasking: ['sepalCloudScore', 'sentinel2CloudScorePlus'],
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE',
            filters: []
        },
        sceneSelectionOptions: {
            type: 'ALL',
            targetDateWeight: 0
        }
    }
}
