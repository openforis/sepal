const getDefaults = () => {
    const year = new Date().getUTCFullYear()
    return {
        dates: {
            targetDate: `${year}-07-02`,
            seasonStart: `${year}-01-01`,
            seasonEnd: `${year + 1}-01-01`,
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
        },
        sceneSelectionOptions: {
            type: 'ALL',
            targetDateWeight: 0
        },
        compositeOptions: {
            corrections: ['SR', 'BRDF'],
            brdfMultiplier: 4,
            filters: [],
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
            sentinel2CloudProbabilityMaxCloudProbability: 65,
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            landsatCFMaskCloudMasking: 'MODERATE',
            landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE',
            landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffer: 0,
            holes: 'ALLOW',
            snowMasking: 'ON',
            compose: 'MEDOID'
        },
        scenes: {}
    }
}

module.exports = {getDefaults}
