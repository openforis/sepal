module.exports = {
    id: 'landsat-annual-mosaic',
    recipeType: 'MOSAIC',
    name: 'Annual Landsat Composite',
    description: 'Annual Landsat 8/9 composite with surface reflectance and BRDF corrections. A good starting point for land cover analysis.',
    tags: ['landsat', 'annual', 'optical', 'composite', 'sr'],
    requiredOverrides: ['aoi'],
    model: {
        dates: {
            type: 'YEARLY_TIME_SCAN',
            targetDate: '2024-06-15',
            seasonStart: '2024-01-01',
            seasonEnd: '2025-01-01',
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
        },
        compositeOptions: {
            corrections: ['SR', 'BRDF'],
            brdfMultiplier: 4,
            compose: 'MEDOID',
            snowMasking: 'ON',
            holes: 'ALLOW',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
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
